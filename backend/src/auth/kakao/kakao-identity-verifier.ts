import { parse } from "lossless-json";
import { z } from "zod";
import { ApiError } from "../../http/api-error.js";

const KAKAO_API_BASE_URL = "https://kapi.kakao.com";
const MAX_RESPONSE_BYTES = 64 * 1_024;
const integerString = z.string().regex(/^-?\d+$/u);

const tokenInfoSchema = z.object({
  id: integerString.refine((value) => !value.startsWith("-")),
  expires_in: integerString.refine((value) => BigInt(value) > 0n),
  app_id: integerString.refine((value) => !value.startsWith("-")),
});

const userInfoSchema = z.object({
  id: integerString.refine((value) => !value.startsWith("-")),
  kakao_account: z
    .object({
      profile: z
        .object({
          nickname: z.string().nullable().optional(),
          profile_image_url: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

const errorSchema = z.object({ code: integerString.optional() });

export type VerifiedKakaoIdentity = {
  subject: string;
  displayName: string | null;
  profileImageUrl: string | null;
  locale: null;
};

export interface KakaoIdentityVerifier {
  verify(accessToken: string): Promise<VerifiedKakaoIdentity>;
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export class KakaoApiIdentityVerifier implements KakaoIdentityVerifier {
  constructor(
    private readonly appId: string,
    private readonly timeoutMillis: number,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async verify(accessToken: string): Promise<VerifiedKakaoIdentity> {
    const tokenInfo = await this.request(
      `${KAKAO_API_BASE_URL}/v1/user/access_token_info`,
      accessToken,
      tokenInfoSchema,
    );
    if (tokenInfo.app_id !== this.appId) {
      throw invalidKakaoToken();
    }

    const query = new URLSearchParams({
      secure_resource: "true",
      property_keys: JSON.stringify(["kakao_account.profile"]),
    });
    const userInfo = await this.request(
      `${KAKAO_API_BASE_URL}/v2/user/me?${query.toString()}`,
      accessToken,
      userInfoSchema,
    );
    if (userInfo.id !== tokenInfo.id) {
      throw providerError(502, "PROVIDER_INVALID_RESPONSE", "Kakao returned inconsistent data");
    }

    return {
      subject: tokenInfo.id,
      displayName: normalizeText(userInfo.kakao_account?.profile?.nickname, 80),
      profileImageUrl: normalizeHttpsUrl(userInfo.kakao_account?.profile?.profile_image_url),
      locale: null,
    };
  }

  private async request<T extends z.ZodType>(
    url: string,
    accessToken: string,
    schema: T,
  ): Promise<z.output<T>> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(this.timeoutMillis),
      });
    } catch (cause) {
      if (isTimeout(cause)) {
        throw providerError(503, "PROVIDER_TIMEOUT", "Kakao authentication timed out");
      }
      throw providerError(
        503,
        "PROVIDER_UNAVAILABLE",
        "Kakao authentication is temporarily unavailable",
      );
    }

    const payload = await readProviderJson(response, response.ok);
    if (!response.ok) throw mapProviderFailure(response.status, payload);

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw providerError(502, "PROVIDER_INVALID_RESPONSE", "Kakao returned an invalid response");
    }
    return parsed.data;
  }
}

async function readProviderJson(response: Response, requireValidJson: boolean): Promise<unknown> {
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_RESPONSE_BYTES) {
    throw providerError(502, "PROVIDER_INVALID_RESPONSE", "Kakao returned an invalid response");
  }

  const text = await readBoundedText(response);

  try {
    return parse(text, null, (value) => value);
  } catch {
    if (!requireValidJson) return null;
    throw providerError(502, "PROVIDER_INVALID_RESPONSE", "Kakao returned an invalid response");
  }
}

async function readBoundedText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw providerError(502, "PROVIDER_INVALID_RESPONSE", "Kakao returned an invalid response");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw providerError(502, "PROVIDER_INVALID_RESPONSE", "Kakao returned an invalid response");
  } finally {
    reader.releaseLock();
  }
}

function mapProviderFailure(status: number, payload: unknown): ApiError {
  const parsedError = errorSchema.safeParse(payload);
  const code = parsedError.success ? parsedError.data.code : undefined;
  if (status === 401 || code === "-401" || code === "-2") return invalidKakaoToken();
  if (status === 429) {
    return providerError(503, "PROVIDER_RATE_LIMIT", "Kakao authentication is temporarily busy");
  }
  if (status >= 500 || code === "-1") {
    return providerError(
      503,
      "PROVIDER_UNAVAILABLE",
      "Kakao authentication is temporarily unavailable",
    );
  }
  return providerError(502, "PROVIDER_INVALID_RESPONSE", "Kakao returned an invalid response");
}

function isTimeout(cause: unknown): boolean {
  return (
    cause instanceof Error && (cause.name === "TimeoutError" || cause.name === "AbortError")
  );
}

function normalizeText(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function invalidKakaoToken(): ApiError {
  return new ApiError({
    statusCode: 401,
    code: "INVALID_TOKEN",
    message: "Kakao access token is invalid",
  });
}

function providerError(statusCode: number, code: string, message: string): ApiError {
  return new ApiError({ statusCode, code, message });
}

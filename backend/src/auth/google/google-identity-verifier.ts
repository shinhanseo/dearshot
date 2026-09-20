import { timingSafeEqual } from "node:crypto";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { ApiError } from "../../http/api-error.js";

export type VerifiedGoogleIdentity = {
  subject: string;
  nonce: string;
  displayName: string | null;
  profileImageUrl: string | null;
  locale: string | null;
  tokenExpiresAt: Date;
};

export interface GoogleIdentityVerifier {
  verify(idToken: string, expectedNonce: string): Promise<VerifiedGoogleIdentity>;
}

type GoogleTokenClient = Pick<OAuth2Client, "verifyIdToken">;

export class GoogleAuthLibraryVerifier implements GoogleIdentityVerifier {
  constructor(
    private readonly clientId: string,
    private readonly client: GoogleTokenClient = new OAuth2Client(),
  ) {}

  async verify(idToken: string, expectedNonce: string): Promise<VerifiedGoogleIdentity> {
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      const payload = ticket.getPayload();
      return this.toVerifiedIdentity(payload, expectedNonce);
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      throw invalidGoogleToken(cause);
    }
  }

  private toVerifiedIdentity(
    payload: TokenPayload | undefined,
    expectedNonce: string,
  ): VerifiedGoogleIdentity {
    if (
      !payload?.sub ||
      !payload.exp ||
      !payload.nonce ||
      !constantTimeEqual(payload.nonce, expectedNonce)
    ) {
      throw invalidGoogleToken();
    }

    return {
      subject: payload.sub,
      nonce: payload.nonce,
      displayName: normalizeText(payload.name, 80),
      profileImageUrl: normalizeUrl(payload.picture),
      locale: normalizeLocale(payload.locale),
      tokenExpiresAt: new Date(payload.exp * 1_000),
    };
  }
}

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

function normalizeText(value: string | undefined, maxLength: number): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeLocale(value: string | undefined): string | null {
  if (!value || value.length > 35) return null;
  try {
    return Intl.getCanonicalLocales(value.replaceAll("_", "-"))[0] ?? null;
  } catch {
    return null;
  }
}

function invalidGoogleToken(cause?: unknown): ApiError {
  return new ApiError({
    statusCode: 401,
    code: "INVALID_TOKEN",
    message: "Google ID token is invalid",
    cause,
  });
}

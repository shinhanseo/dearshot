import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KakaoApiIdentityVerifier } from "../../src/auth/kakao/kakao-identity-verifier.js";
import { ApiError } from "../../src/http/api-error.js";

const appId = "987654";
const subject = "9223372036854775807";

describe("KakaoApiIdentityVerifier", () => {
  it("verifies app ownership and preserves a 64-bit Kakao member number", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const responses = [
      jsonResponse(`{"id":${subject},"expires_in":43199,"app_id":${appId}}`),
      jsonResponse(
        `{"id":${subject},"kakao_account":{"profile":{"nickname":"  카카오 사용자  ","profile_image_url":"https://example.com/profile.jpg"}}}`,
      ),
    ];
    const verifier = new KakaoApiIdentityVerifier(appId, 3_000, async (url, init) => {
      calls.push({ url, init });
      return responses.shift()!;
    });

    const identity = await verifier.verify("raw-kakao-access-token");

    assert.equal(identity.subject, subject);
    assert.equal(identity.displayName, "카카오 사용자");
    assert.equal(identity.profileImageUrl, "https://example.com/profile.jpg");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://kapi.kakao.com/v1/user/access_token_info");
    assert.match(calls[1].url, /^https:\/\/kapi\.kakao\.com\/v2\/user\/me\?/u);
    assert.match(calls[1].url, /secure_resource=true/u);
    assert.equal(
      (calls[0].init.headers as Record<string, string>).Authorization,
      "Bearer raw-kakao-access-token",
    );
  });

  it("rejects a valid token issued for another Kakao app", async () => {
    const verifier = new KakaoApiIdentityVerifier(appId, 3_000, async () =>
      jsonResponse(`{"id":123,"expires_in":100,"app_id":111111}`),
    );

    await expectApiError(verifier.verify("other-app-token"), 401, "INVALID_TOKEN");
  });

  it("rejects inconsistent member numbers from Kakao endpoints", async () => {
    const responses = [
      jsonResponse(`{"id":123,"expires_in":100,"app_id":${appId}}`),
      jsonResponse(`{"id":456,"kakao_account":{}}`),
    ];
    const verifier = new KakaoApiIdentityVerifier(appId, 3_000, async () => responses.shift()!);

    await expectApiError(
      verifier.verify("inconsistent-token"),
      502,
      "PROVIDER_INVALID_RESPONSE",
    );
  });

  it("maps invalid tokens, rate limits, and provider outages to stable errors", async () => {
    const cases = [
      { response: jsonResponse('{"code":-401,"msg":"raw provider details"}', 401), status: 401, code: "INVALID_TOKEN" },
      { response: new Response("rate limited", { status: 429 }), status: 503, code: "PROVIDER_RATE_LIMIT" },
      { response: jsonResponse('{"code":-1,"msg":"internal details"}', 400), status: 503, code: "PROVIDER_UNAVAILABLE" },
    ];

    for (const testCase of cases) {
      const verifier = new KakaoApiIdentityVerifier(appId, 3_000, async () => testCase.response);
      await expectApiError(
        verifier.verify("provider-error-token"),
        testCase.status,
        testCase.code,
        "raw provider details|quota details|internal details",
      );
    }
  });

  it("maps a bounded request timeout without exposing the access token", async () => {
    const verifier = new KakaoApiIdentityVerifier(appId, 500, async () => {
      const error = new Error("network details raw-kakao-access-token");
      error.name = "TimeoutError";
      throw error;
    });

    await expectApiError(
      verifier.verify("raw-kakao-access-token"),
      503,
      "PROVIDER_TIMEOUT",
      "raw-kakao-access-token",
    );
  });

  it("rejects malformed or oversized provider responses", async () => {
    const malformed = new KakaoApiIdentityVerifier(
      appId,
      3_000,
      async () => new Response("not-json", { status: 200 }),
    );
    const oversized = new KakaoApiIdentityVerifier(
      appId,
      3_000,
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "Content-Length": String(64 * 1_024 + 1) },
        }),
    );

    await expectApiError(malformed.verify("token"), 502, "PROVIDER_INVALID_RESPONSE");
    await expectApiError(oversized.verify("token"), 502, "PROVIDER_INVALID_RESPONSE");
  });
});

function jsonResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function expectApiError(
  promise: Promise<unknown>,
  statusCode: number,
  code: string,
  forbiddenPattern?: string,
) {
  await assert.rejects(
    promise,
    (error: unknown) =>
      error instanceof ApiError &&
      error.statusCode === statusCode &&
      error.code === code &&
      (!forbiddenPattern || !new RegExp(forbiddenPattern, "u").test(error.message)),
  );
}

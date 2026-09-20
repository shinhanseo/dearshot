import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthConfig } from "../../src/config/environment.js";
import { ApiError } from "../../src/http/api-error.js";
import { TokenService } from "../../src/auth/token-service.js";

const authConfig: AuthConfig = {
  accessTokenSecret: "unit-test-secret-with-at-least-32-characters",
  issuer: "dearshot-api-test",
  audience: "dearshot-android-test",
  accessTokenTtlSeconds: 60,
  refreshTokenTtlSeconds: 3_600,
};

describe("TokenService", () => {
  it("issues and verifies an access token with fixed claims", async () => {
    const service = new TokenService(authConfig);
    const now = new Date("2026-09-20T00:00:00.000Z");
    const principal = {
      sub: "11111111-1111-4111-8111-111111111111",
      sid: "22222222-2222-4222-8222-222222222222",
      principalType: "GUEST" as const,
      role: "USER" as const,
    };

    const issued = await service.issueAccessToken(principal, now);
    const verified = await service.verifyAccessToken(issued.token, now);

    assert.equal(verified.sub, principal.sub);
    assert.equal(verified.sid, principal.sid);
    assert.equal(verified.principalType, "GUEST");
    assert.equal(issued.expiresAt.toISOString(), "2026-09-20T00:01:00.000Z");
  });

  it("rejects expired access tokens with a stable error code", async () => {
    const service = new TokenService(authConfig);
    const issuedAt = new Date("2026-09-20T00:00:00.000Z");
    const issued = await service.issueAccessToken(
      {
        sub: "11111111-1111-4111-8111-111111111111",
        sid: "22222222-2222-4222-8222-222222222222",
        principalType: "GUEST",
        role: "USER",
      },
      issuedAt,
    );

    await assert.rejects(
      service.verifyAccessToken(issued.token, new Date("2026-09-20T00:01:01.000Z")),
      (error: unknown) => error instanceof ApiError && error.code === "TOKEN_EXPIRED",
    );
  });

  it("rejects access tokens signed with a different secret", async () => {
    const issuer = new TokenService(authConfig);
    const verifier = new TokenService({
      ...authConfig,
      accessTokenSecret: "a-different-test-secret-with-32-characters",
    });
    const now = new Date("2026-09-20T00:00:00.000Z");
    const issued = await issuer.issueAccessToken(
      {
        sub: "11111111-1111-4111-8111-111111111111",
        sid: "22222222-2222-4222-8222-222222222222",
        principalType: "GUEST",
        role: "USER",
      },
      now,
    );

    await assert.rejects(
      verifier.verifyAccessToken(issued.token, now),
      (error: unknown) => error instanceof ApiError && error.code === "INVALID_TOKEN",
    );
  });

  it("creates unpredictable refresh tokens and deterministic SHA-256 hashes", () => {
    const service = new TokenService(authConfig);
    const first = service.createRefreshToken();
    const second = service.createRefreshToken();

    assert.equal(first.plaintext.length, 43);
    assert.equal(first.hash.length, 64);
    assert.equal(service.hashRefreshToken(first.plaintext), first.hash);
    assert.notEqual(first.plaintext, second.plaintext);
    assert.notEqual(first.hash, second.hash);
    assert.notEqual(first.plaintext, first.hash);
  });
});

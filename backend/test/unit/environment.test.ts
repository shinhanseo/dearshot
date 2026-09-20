import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadEnvironment } from "../../src/config/environment.js";

const baseEnvironment = {
  DATABASE_URL: "postgresql://user:password@postgres:5432/dearshot",
  JWT_ACCESS_SECRET: "replace-with-at-least-32-random-characters",
};

describe("environment configuration", () => {
  it("applies bounded authentication defaults in development", () => {
    const environment = loadEnvironment(baseEnvironment);

    assert.equal(environment.auth.accessTokenTtlSeconds, 900);
    assert.equal(environment.auth.refreshTokenTtlSeconds, 2_592_000);
    assert.equal(environment.auth.issuer, "dearshot-api");
    assert.equal(environment.google.webClientId, "replace-with-google-web-client-id");
    assert.equal(environment.kakao.appId, "replace-with-kakao-app-id");
    assert.equal(environment.kakao.apiTimeoutMillis, 3_000);
  });

  it("requires a real Google web client ID in production", () => {
    assert.throws(
      () =>
        loadEnvironment({
          ...baseEnvironment,
          NODE_ENV: "production",
          JWT_ACCESS_SECRET: "a-production-secret-with-at-least-32-characters",
        }),
      /GOOGLE_WEB_CLIENT_ID must be replaced in production/,
    );
  });

  it("requires a real Kakao app ID in production", () => {
    assert.throws(
      () =>
        loadEnvironment({
          ...baseEnvironment,
          NODE_ENV: "production",
          JWT_ACCESS_SECRET: "a-production-secret-with-at-least-32-characters",
          GOOGLE_WEB_CLIENT_ID: "google-client.apps.googleusercontent.com",
        }),
      /KAKAO_APP_ID must be replaced in production/,
    );
  });

  it("rejects a Kakao app key where the numeric app ID is required", () => {
    assert.throws(
      () => loadEnvironment({ ...baseEnvironment, KAKAO_APP_ID: "native-app-key" }),
      /KAKAO_APP_ID must be a numeric Kakao app ID/,
    );
  });

  it("rejects the documented placeholder JWT secret in production", () => {
    assert.throws(
      () => loadEnvironment({ ...baseEnvironment, NODE_ENV: "production" }),
      /JWT_ACCESS_SECRET must be replaced in production/,
    );
  });
});

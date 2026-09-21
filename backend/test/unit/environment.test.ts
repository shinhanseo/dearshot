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
    assert.equal(environment.catalog.assetBaseUrl, "http://localhost:3000/assets/catalog");
    assert.equal(environment.catalog.assetRoot, "catalog/assets");
    assert.deepEqual(environment.uploads, {
      root: "/srv/dearshot/uploads",
      maxBytes: 10_485_760,
      maxDimensionPixels: 8_192,
      maxPixels: 40_000_000,
      ttlSeconds: 3_600,
    });
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

  it("requires HTTPS for public catalog assets in production", () => {
    assert.throws(
      () =>
        loadEnvironment({
          ...baseEnvironment,
          NODE_ENV: "production",
          JWT_ACCESS_SECRET: "a-production-secret-with-at-least-32-characters",
          GOOGLE_WEB_CLIENT_ID: "google-client.apps.googleusercontent.com",
          KAKAO_APP_ID: "123456",
          PUBLIC_ASSET_BASE_URL: "http://assets.dearshot.example/catalog",
        }),
      /PUBLIC_ASSET_BASE_URL must use HTTPS in production/u,
    );
  });

  it("requires an absolute upload root and bounded upload limits", () => {
    assert.throws(
      () => loadEnvironment({ ...baseEnvironment, UPLOAD_ROOT: "uploads" }),
      /UPLOAD_ROOT must be an absolute path/u,
    );
    assert.throws(
      () => loadEnvironment({ ...baseEnvironment, UPLOAD_TTL_SECONDS: "3601" }),
      /UPLOAD_TTL_SECONDS must be at most 3600/u,
    );
  });
});

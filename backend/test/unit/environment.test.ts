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
    assert.deepEqual(environment.http, { trustProxyHops: 0, corsAllowedOrigins: [] });
    assert.deepEqual(environment.rateLimits, {
      aiRequestsPerIpPerMinute: 30,
      authRequestsPerIpPerMinute: 20,
      appEventBatchesPerIpPerMinute: 30,
    });
    assert.deepEqual(environment.ai, {
      provider: "mock",
      apiKey: "",
      gemini: {
        sceneModel: "gemini-3.5-flash-lite",
        feedbackModel: "gemini-3.5-flash",
        timeoutMillis: 10_000,
        maximumResponseBytes: 262_144,
      },
    });
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
    assert.deepEqual(environment.usage, {
      timezone: "UTC",
      guest: { sceneAnalysesPerDay: 5, photoFeedbacksPerDay: 10 },
      member: { sceneAnalysesPerDay: 50, photoFeedbacksPerDay: 100 },
    });
    assert.equal(environment.idempotency.ttlSeconds, 86_400);
    assert.deepEqual(environment.sceneAnalysis, {
      retentionDays: 7,
      workerEnabled: true,
      workerPollIntervalMillis: 1_000,
      workerLeaseSeconds: 30,
      workerMaxAttempts: 3,
      workerRetryBaseSeconds: 1,
      pollAfterMillis: 500,
      maximumCandidates: 12,
      minimumConfidence: 0.55,
    });
    assert.deepEqual(environment.photoFeedback, {
      retentionDays: 7,
      pollAfterMillis: 1_000,
    });
    assert.equal(environment.appConfig.minimumSupportedVersion, "1.0.0");
    assert.equal(environment.appConfig.features.kakaoLogin, true);
    assert.deepEqual(environment.productEvents, {
      retentionDays: 90,
      maximumPastAgeDays: 7,
      maximumFutureSkewSeconds: 300,
    });
    assert.deepEqual(environment.privacy, {
      workerEnabled: true,
      cleanupIntervalMillis: 300_000,
      aiAttemptRetentionDays: 30,
      deletionStatusRetentionDays: 7,
      deletionRetryBaseSeconds: 5,
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

  it("validates remote app versions and strict boolean flags", () => {
    assert.throws(
      () =>
        loadEnvironment({
          ...baseEnvironment,
          APP_MINIMUM_SUPPORTED_VERSION: "2.0.0",
          APP_LATEST_VERSION: "1.9.9",
        }),
      /APP_MINIMUM_SUPPORTED_VERSION cannot be newer/u,
    );
    assert.throws(
      () => loadEnvironment({ ...baseEnvironment, APP_MAINTENANCE: "yes" }),
      /APP_MAINTENANCE/u,
    );
    assert.throws(
      () => loadEnvironment({ ...baseEnvironment, APP_EVENT_RETENTION_DAYS: "366" }),
      /APP_EVENT_RETENTION_DAYS must be at most 365/u,
    );
    assert.throws(
      () => loadEnvironment({ ...baseEnvironment, SCENE_WORKER_LEASE_SECONDS: "4" }),
      /SCENE_WORKER_LEASE_SECONDS must be at least 5/u,
    );
  });

  it("requires a Gemini key when the real provider is selected", () => {
    assert.throws(
      () => loadEnvironment({ ...baseEnvironment, AI_PROVIDER: "gemini" }),
      /AI_API_KEY is required/u,
    );
    assert.equal(loadEnvironment({
      ...baseEnvironment,
      AI_PROVIDER: "gemini",
      AI_API_KEY: "test-key",
    }).ai.provider, "gemini");
  });

  it("accepts exact CORS origins and rejects unsafe production origins", () => {
    const environment = loadEnvironment({
      ...baseEnvironment,
      CORS_ALLOWED_ORIGINS: "https://admin.dearshot.app, https://docs.dearshot.app",
    });
    assert.deepEqual(environment.http.corsAllowedOrigins, [
      "https://admin.dearshot.app",
      "https://docs.dearshot.app",
    ]);

    assert.throws(
      () => loadEnvironment({ ...baseEnvironment, CORS_ALLOWED_ORIGINS: "*" }),
      /invalid origin/u,
    );
    assert.throws(
      () =>
        loadEnvironment({
          ...baseEnvironment,
          NODE_ENV: "production",
          JWT_ACCESS_SECRET: "a-production-secret-with-at-least-32-characters",
          GOOGLE_WEB_CLIENT_ID: "google-client.apps.googleusercontent.com",
          KAKAO_APP_ID: "123456",
          PUBLIC_ASSET_BASE_URL: "https://assets.dearshot.app/catalog",
          CORS_ALLOWED_ORIGINS: "http://admin.dearshot.app",
        }),
      /must use HTTPS origins/u,
    );
  });
});

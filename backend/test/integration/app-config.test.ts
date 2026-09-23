import assert from "node:assert/strict";
import { describe, it } from "node:test";
import pino from "pino";
import request from "supertest";
import { createApp } from "../../src/app.js";

const settings = {
  app: {
    minimumSupportedVersion: "1.2.0",
    latestVersion: "1.4.1",
    maintenance: false,
    catalogVersion: "2026.09.23.1",
    recommendedLongEdgePixels: 2_048,
    legal: {
      privacyPolicyVersion: "2026-09-01",
      privacyPolicyUrl: "https://dearshot.app/privacy",
      termsVersion: "2026-09-01",
      termsUrl: "https://dearshot.app/terms",
    },
    features: { kakaoLogin: true, locationContext: true, feedbackComparison: false },
  },
  guestLimits: { sceneAnalysesPerDay: 5, photoFeedbacksPerDay: 10 },
  upload: { maxBytes: 10_485_760 },
} as const;

describe("app configuration", () => {
  it("returns server-owned limits and derives force update from the Android version", async () => {
    const app = createApp({
      logger: pino({ level: "silent" }),
      checkDatabase: async () => undefined,
      appConfig: settings,
    });

    const oldClient = await request(app).get(
      "/api/v1/app-config?platform=android&appVersion=1.1.9&locale=ko-KR",
    );
    const currentClient = await request(app).get(
      "/api/v1/app-config?platform=android&appVersion=1.2.0&locale=en-US",
    );

    assert.equal(oldClient.status, 200);
    assert.equal(oldClient.body.forceUpdate, true);
    assert.equal(currentClient.body.forceUpdate, false);
    assert.equal(oldClient.body.catalogVersion, "2026.09.23.1");
    assert.deepEqual(oldClient.body.guestLimits, settings.guestLimits);
    assert.deepEqual(oldClient.body.upload, {
      maxBytes: 10_485_760,
      supportedContentTypes: ["image/jpeg", "image/webp"],
      recommendedLongEdgePx: 2_048,
    });
    assert.match(oldClient.headers["cache-control"], /max-age=60/u);
  });

  it("rejects unsupported platforms and malformed versions", async () => {
    const app = createApp({
      logger: pino({ level: "silent" }),
      checkDatabase: async () => undefined,
      appConfig: settings,
    });
    const response = await request(app).get(
      "/api/v1/app-config?platform=ios&appVersion=version-one",
    );

    assert.equal(response.status, 400);
    assert.equal(response.body.code, "INVALID_REQUEST");
  });
});

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { TokenService } from "../../src/auth/token-service.js";
import type { AuthConfig, DatabaseConfig } from "../../src/config/environment.js";
import { closeDatabaseConnection, createDatabaseConnection, type DatabaseConnection, verifyDatabaseConnection } from "../../src/db/client.js";
import { dailyUsage } from "../../src/db/schema/analytics.js";
import { refreshSessions, userPreferences, users } from "../../src/db/schema/identity.js";
import { imageUploads, sceneAnalyses } from "../../src/db/schema/jobs.js";
import { IdempotencyService } from "../../src/reliability/idempotency-service.js";
import { UsageLimitService } from "../../src/reliability/usage-limit-service.js";
import { SceneAnalysisService } from "../../src/scene-analysis/scene-analysis-service.js";
import { ImageStorage } from "../../src/uploads/image-storage.js";
import { UploadService } from "../../src/uploads/upload-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for database tests.");
const databaseConfig: DatabaseConfig = { connectionString: databaseUrl, maxConnections: 8, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 5_000 };
const authConfig: AuthConfig = {
  accessTokenSecret: "scene-analysis-test-secret-with-at-least-32-characters",
  issuer: "dearshot-api-scene-test", audience: "dearshot-android-scene-test",
  accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
};
const limits = {
  timezone: "UTC" as const,
  guest: { sceneAnalysesPerDay: 2, photoFeedbacksPerDay: 2 },
  member: { sceneAnalysesPerDay: 5, photoFeedbacksPerDay: 5 },
};
const logger = pino({ level: "silent" });
let connection: DatabaseConnection;
let tokenService: TokenService;
let uploadRoot: string;

async function createPrincipal(accountType: "GUEST" | "MEMBER" = "GUEST") {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await connection.db.insert(users).values({ id: userId, accountType });
  await connection.db.insert(userPreferences).values({ userId, locale: "ko-KR" });
  await connection.db.insert(refreshSessions).values({
    id: sessionId, userId, installationId: randomUUID(), tokenHash: randomBytes(32).toString("hex"),
    tokenFamilyId: randomUUID(), expiresAt: new Date(Date.now() + 60_000),
  });
  const access = await tokenService.issueAccessToken({ sub: userId, sid: sessionId, principalType: accountType, role: "USER" });
  return { userId, token: access.token };
}

async function createUpload(ownerUserId: string, purpose: "SCENE_ANALYSIS" | "PHOTO_FEEDBACK" = "SCENE_ANALYSIS", expiresAt = new Date(Date.now() + 60_000)) {
  const id = randomUUID();
  await connection.db.insert(imageUploads).values({
    id, ownerUserId, purpose, storagePath: `objects/aa/${randomBytes(24).toString("hex")}.jpg`,
    contentType: "image/jpeg", byteSize: 1024, sha256: randomBytes(32).toString("hex"),
    width: 1080, height: 1440, expiresAt,
  });
  return id;
}

function createContext() {
  const storage = new ImageStorage({ root: uploadRoot, maxBytes: 10_485_760, maxDimensionPixels: 8_192, maxPixels: 40_000_000 });
  const idempotency = new IdempotencyService(connection.db);
  const uploads = new UploadService(connection.db, storage, { ttlSeconds: 3_600 }, idempotency);
  const service = new SceneAnalysisService(connection.db, uploads, idempotency, new UsageLimitService(connection.db, limits), { retentionDays: 7 });
  const app = createApp({
    logger, checkDatabase: () => verifyDatabaseConnection(connection.pool),
    sceneAnalysis: { service, tokenService },
  });
  return { app, service };
}

function payload(uploadId: string) {
  return {
    uploadId, sceneRevision: 3, capturedAt: "2026-09-27T05:30:00Z", locale: "ko-KR",
    deviceAnalysis: {
      sceneClassifier: { model: "places365-resnet18", modelVersion: "places365-standard", runtime: "onnxruntime-android", candidates: [{ label: "beach", confidence: 0.91 }] },
      objectDetector: { model: "yolox-nano", modelVersion: "coco-2017", runtime: "onnxruntime-android", objects: [{ label: "person", confidence: 0.96, box: { left: 0.3, top: 0.18, right: 0.62, bottom: 0.94 } }] },
    },
    context: { timezone: "Asia/Seoul", location: { latitude: 35.1532, longitude: 129.1187, accuracyMeters: 20 } },
  };
}

describe("scene analysis jobs", { concurrency: 1 }, () => {
  before(async () => {
    connection = createDatabaseConnection(databaseConfig, logger);
    tokenService = new TokenService(authConfig);
    uploadRoot = await mkdtemp(path.join(os.tmpdir(), "dearshot-scene-test-"));
    await verifyDatabaseConnection(connection.pool);
  });
  beforeEach(async () => {
    await connection.db.execute(sql`truncate table scene_analyses, image_uploads, idempotency_records, daily_usage, oauth_nonce_uses, auth_identities, refresh_sessions, user_preferences, users restart identity cascade`);
  });
  after(async () => { await closeDatabaseConnection(connection.pool); await rm(uploadRoot, { recursive: true, force: true }); });

  it("creates, reads, and cancels a job while preserving revision and device hints", async () => {
    const principal = await createPrincipal();
    const uploadId = await createUpload(principal.userId);
    const { app, service } = createContext();
    const created = await request(app).post("/api/v1/scene-analyses")
      .set("Authorization", `Bearer ${principal.token}`).set("Idempotency-Key", randomUUID()).send(payload(uploadId));
    assert.equal(created.status, 202, JSON.stringify(created.body));
    assert.equal(created.body.sceneRevision, 3);
    assert.equal(created.body.status, "QUEUED");

    const [stored] = await connection.db.select().from(sceneAnalyses).where(eq(sceneAnalyses.id, created.body.analysisId));
    assert.equal(stored.sceneRevision, 3);
    assert.equal(stored.deviceAnalysis?.sceneClassifier?.candidates[0]?.label, "beach");
    assert.equal(stored.timezone, "Asia/Seoul");
    const [upload] = await connection.db.select().from(imageUploads).where(eq(imageUploads.id, uploadId));
    assert.equal(upload.status, "CONSUMED");
    const [usage] = await connection.db.select().from(dailyUsage).where(eq(dailyUsage.userId, principal.userId));
    assert.equal(usage.sceneAnalysisCount, 1);

    const fetched = await request(app).get(`/api/v1/scene-analyses/${created.body.analysisId}`).set("Authorization", `Bearer ${principal.token}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.sceneRevision, 3);
    assert.equal(JSON.stringify(fetched.body).includes("deviceAnalysis"), false);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const cancelled = await request(app).delete(`/api/v1/scene-analyses/${created.body.analysisId}`).set("Authorization", `Bearer ${principal.token}`);
      assert.equal(cancelled.status, 204);
    }
    assert.equal(await service.completeIfProcessing(created.body.analysisId, { templateId: "beach-walk" }), false);
    const [cancelled] = await connection.db.select().from(sceneAnalyses).where(eq(sceneAnalyses.id, created.body.analysisId));
    assert.equal(cancelled.status, "CANCELLED");
    assert.ok(cancelled.cancelledAt);
    assert.equal(cancelled.result, null);
  });

  it("supports optional hints and replays the same idempotent response without double charging", async () => {
    const principal = await createPrincipal();
    const uploadId = await createUpload(principal.userId);
    const { app } = createContext();
    const key = randomUUID();
    const body = { ...payload(uploadId), deviceAnalysis: undefined };
    const first = await request(app).post("/api/v1/scene-analyses").set("Authorization", `Bearer ${principal.token}`).set("Idempotency-Key", key).send(body);
    const replay = await request(app).post("/api/v1/scene-analyses").set("Authorization", `Bearer ${principal.token}`).set("Idempotency-Key", key).send(body);
    assert.equal(first.status, 202);
    assert.equal(replay.status, 202);
    assert.equal(replay.headers["idempotency-replayed"], "true");
    assert.equal(replay.body.analysisId, first.body.analysisId);
    const [usage] = await connection.db.select().from(dailyUsage).where(eq(dailyUsage.userId, principal.userId));
    assert.equal(usage.sceneAnalysisCount, 1);
    const conflict = await request(app).post("/api/v1/scene-analyses").set("Authorization", `Bearer ${principal.token}`).set("Idempotency-Key", key).send({ ...body, sceneRevision: 4 });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, "IDEMPOTENCY_CONFLICT");
  });

  it("hides foreign uploads and rolls back usage for invalid purpose or expired uploads", async () => {
    const owner = await createPrincipal();
    const other = await createPrincipal();
    const { app } = createContext();
    const cases = [
      { uploadId: await createUpload(owner.userId), principal: other, code: "RESOURCE_NOT_FOUND", status: 404 },
      { uploadId: await createUpload(other.userId, "PHOTO_FEEDBACK"), principal: other, code: "UPLOAD_PURPOSE_MISMATCH", status: 409 },
      { uploadId: await createUpload(other.userId, "SCENE_ANALYSIS", new Date(Date.now() - 1_000)), principal: other, code: "UPLOAD_EXPIRED", status: 409 },
    ];
    for (const item of cases) {
      const response = await request(app).post("/api/v1/scene-analyses").set("Authorization", `Bearer ${item.principal.token}`).set("Idempotency-Key", randomUUID()).send(payload(item.uploadId));
      assert.equal(response.status, item.status);
      assert.equal(response.body.code, item.code);
    }
    const counts = await connection.db.select({ count: sql<number>`count(*)::int` }).from(dailyUsage);
    assert.equal(counts[0]?.count, 0);
    const analyses = await connection.db.select({ count: sql<number>`count(*)::int` }).from(sceneAnalyses);
    assert.equal(analyses[0]?.count, 0);
  });
});

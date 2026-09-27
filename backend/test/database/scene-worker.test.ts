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
import { TokenService, type AccessPrincipal } from "../../src/auth/token-service.js";
import type { AuthConfig, DatabaseConfig } from "../../src/config/environment.js";
import { closeDatabaseConnection, createDatabaseConnection, type DatabaseConnection, verifyDatabaseConnection } from "../../src/db/client.js";
import { refreshSessions, userPreferences, users } from "../../src/db/schema/identity.js";
import { imageUploads, sceneAnalyses } from "../../src/db/schema/jobs.js";
import { IdempotencyService } from "../../src/reliability/idempotency-service.js";
import { UsageLimitService } from "../../src/reliability/usage-limit-service.js";
import { FakeSceneAnalysisProcessor, type ClaimedSceneAnalysis, type SceneAnalysisProcessor, type SceneProcessingContext, type SceneProcessingResult, SceneProcessingError } from "../../src/scene-analysis/scene-analysis-processor.js";
import { SceneAnalysisService } from "../../src/scene-analysis/scene-analysis-service.js";
import { SceneAnalysisWorker } from "../../src/scene-analysis/scene-analysis-worker.js";
import { ImageStorage } from "../../src/uploads/image-storage.js";
import { UploadService } from "../../src/uploads/upload-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for database tests.");
const databaseConfig: DatabaseConfig = { connectionString: databaseUrl, maxConnections: 12, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 5_000 };
const authConfig: AuthConfig = {
  accessTokenSecret: "scene-worker-test-secret-with-at-least-32-characters",
  issuer: "dearshot-api-worker-test", audience: "dearshot-android-worker-test",
  accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
};
const limits = {
  timezone: "UTC" as const,
  guest: { sceneAnalysesPerDay: 20, photoFeedbacksPerDay: 20 },
  member: { sceneAnalysesPerDay: 20, photoFeedbacksPerDay: 20 },
};
const logger = pino({ level: "silent" });
let connection: DatabaseConnection;
let tokenService: TokenService;
let uploadRoot: string;

async function createPrincipal() {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await connection.db.insert(users).values({ id: userId, accountType: "GUEST" });
  await connection.db.insert(userPreferences).values({ userId, locale: "ko-KR" });
  await connection.db.insert(refreshSessions).values({
    id: sessionId, userId, installationId: randomUUID(), tokenHash: randomBytes(32).toString("hex"),
    tokenFamilyId: randomUUID(), expiresAt: new Date(Date.now() + 60_000),
  });
  const principal: AccessPrincipal = { sub: userId, sid: sessionId, principalType: "GUEST", role: "USER", jti: randomUUID() };
  const access = await tokenService.issueAccessToken(principal);
  return { userId, token: access.token, principal };
}

async function createUpload(ownerUserId: string) {
  const id = randomUUID();
  await connection.db.insert(imageUploads).values({
    id, ownerUserId, purpose: "SCENE_ANALYSIS", storagePath: `objects/aa/${randomBytes(24).toString("hex")}.jpg`,
    contentType: "image/jpeg", byteSize: 1024, sha256: randomBytes(32).toString("hex"),
    width: 1080, height: 1440, expiresAt: new Date(Date.now() + 60_000),
  });
  return id;
}

function createContext() {
  const storage = new ImageStorage({ root: uploadRoot, maxBytes: 10_485_760, maxDimensionPixels: 8_192, maxPixels: 40_000_000 });
  const idempotency = new IdempotencyService(connection.db);
  const uploads = new UploadService(connection.db, storage, { ttlSeconds: 3_600 }, idempotency);
  const service = new SceneAnalysisService(
    connection.db, uploads, idempotency, new UsageLimitService(connection.db, limits),
    { retentionDays: 7, maxAttempts: 3, pollAfterMillis: 500 },
  );
  const app = createApp({ logger, checkDatabase: () => verifyDatabaseConnection(connection.pool), sceneAnalysis: { service, tokenService } });
  return { app, service };
}

async function createJob(service: SceneAnalysisService, principal: AccessPrincipal, ownerUserId: string, sceneRevision = 3) {
  const uploadId = await createUpload(ownerUserId);
  const created = await service.create(principal, {
    uploadId, sceneRevision, capturedAt: "2026-09-27T05:30:00Z", locale: "ko-KR",
    deviceAnalysis: {
      sceneClassifier: {
        model: "places365-resnet18", modelVersion: "places365-standard", runtime: "onnxruntime-android",
        candidates: [{ label: "beach", confidence: 0.91 }],
      },
    },
  }, randomUUID());
  return created.body.analysisId;
}

function createWorker(processor: SceneAnalysisProcessor, workerId: string = randomUUID()) {
  return new SceneAnalysisWorker(connection.db, processor, {
    pollIntervalMillis: 10, leaseSeconds: 30, retryBaseSeconds: 1,
  }, logger, workerId);
}

class CountingProcessor implements SceneAnalysisProcessor {
  calls = 0;
  private readonly delegate = new FakeSceneAnalysisProcessor();
  async process(analysis: ClaimedSceneAnalysis, context: SceneProcessingContext): Promise<SceneProcessingResult> {
    this.calls += 1;
    return this.delegate.process(analysis, context);
  }
}

describe("scene worker and polling", { concurrency: 1 }, () => {
  before(async () => {
    connection = createDatabaseConnection(databaseConfig, logger);
    tokenService = new TokenService(authConfig);
    uploadRoot = await mkdtemp(path.join(os.tmpdir(), "dearshot-worker-test-"));
    await verifyDatabaseConnection(connection.pool);
  });
  beforeEach(async () => {
    await connection.db.execute(sql`
      truncate table scene_analyses, image_uploads, idempotency_records, daily_usage,
      oauth_nonce_uses, auth_identities, refresh_sessions, user_preferences, users restart identity cascade
    `);
  });
  after(async () => { await closeDatabaseConnection(connection.pool); await rm(uploadRoot, { recursive: true, force: true }); });

  it("lets competing workers process a job exactly once", async () => {
    const owner = await createPrincipal();
    const { service } = createContext();
    const analysisId = await createJob(service, owner.principal, owner.userId);
    const processor = new CountingProcessor();
    const results = await Promise.all([
      createWorker(processor, "worker-a").runOnce(),
      createWorker(processor, "worker-b").runOnce(),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(processor.calls, 1);
    const [analysis] = await connection.db.select().from(sceneAnalyses).where(eq(sceneAnalyses.id, analysisId));
    assert.equal(analysis.status, "COMPLETED");
    assert.equal(analysis.attemptCount, 1);
    assert.equal(analysis.leaseOwner, null);
  });

  it("reclaims a stale lease after restart and fences the old lease token", async () => {
    const owner = await createPrincipal();
    const { service } = createContext();
    const analysisId = await createJob(service, owner.principal, owner.userId);
    await connection.db.update(sceneAnalyses).set({
      status: "PROCESSING", attemptCount: 1, leaseOwner: "dead-worker:old-token",
      leaseExpiresAt: new Date(Date.now() - 1_000), startedAt: new Date(Date.now() - 2_000),
    }).where(eq(sceneAnalyses.id, analysisId));
    assert.equal(await createWorker(new FakeSceneAnalysisProcessor()).runOnce(), true);
    const [analysis] = await connection.db.select().from(sceneAnalyses).where(eq(sceneAnalyses.id, analysisId));
    assert.equal(analysis.status, "COMPLETED");
    assert.equal(analysis.attemptCount, 2);
    const staleWrite = await connection.db.update(sceneAnalyses).set({ failureCode: "STALE" })
      .where(sql`${sceneAnalyses.id} = ${analysisId} and ${sceneAnalyses.leaseOwner} = ${"dead-worker:old-token"}`)
      .returning({ id: sceneAnalyses.id });
    assert.equal(staleWrite.length, 0);
  });

  it("retries a bounded transient failure and exposes one terminal polling result", async () => {
    const owner = await createPrincipal();
    const { app, service } = createContext();
    const analysisId = await createJob(service, owner.principal, owner.userId, 9);
    let calls = 0;
    const delegate = new FakeSceneAnalysisProcessor();
    const processor: SceneAnalysisProcessor = {
      async process(analysis, context) {
        calls += 1;
        if (calls === 1) throw new SceneProcessingError("PROVIDER_TEMPORARY", true);
        return delegate.process(analysis, context);
      },
    };
    const worker = createWorker(processor);
    assert.equal(await worker.runOnce(), true);
    let polled = await request(app).get(`/api/v1/scene-analyses/${analysisId}`).set("Authorization", `Bearer ${owner.token}`);
    assert.equal(polled.body.status, "QUEUED");
    assert.equal(polled.body.pollAfterMs, 500);
    await connection.db.update(sceneAnalyses).set({ nextAttemptAt: new Date(Date.now() - 1) }).where(eq(sceneAnalyses.id, analysisId));
    assert.equal(await worker.runOnce(), true);
    polled = await request(app).get(`/api/v1/scene-analyses/${analysisId}`).set("Authorization", `Bearer ${owner.token}`);
    assert.equal(polled.body.status, "COMPLETED");
    assert.equal(polled.body.sceneRevision, 9);
    assert.equal(polled.body.pollAfterMs, null);
    assert.equal(polled.body.result.outcome, "RECOMMENDED");
  });

  it("does not let a late processor overwrite cancellation", async () => {
    const owner = await createPrincipal();
    const { app, service } = createContext();
    const analysisId = await createJob(service, owner.principal, owner.userId);
    let release!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const delegate = new FakeSceneAnalysisProcessor();
    const processor: SceneAnalysisProcessor = {
      async process(analysis, context) { markStarted(); await blocked; return delegate.process(analysis, context); },
    };
    const running = createWorker(processor).runOnce();
    await started;
    const cancelled = await request(app).delete(`/api/v1/scene-analyses/${analysisId}`).set("Authorization", `Bearer ${owner.token}`);
    assert.equal(cancelled.status, 204);
    release();
    await running;
    const [analysis] = await connection.db.select().from(sceneAnalyses).where(eq(sceneAnalyses.id, analysisId));
    assert.equal(analysis.status, "CANCELLED");
    assert.equal(analysis.result, null);
  });
});

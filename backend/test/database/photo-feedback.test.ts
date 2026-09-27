import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { TokenService } from "../../src/auth/token-service.js";
import { importCatalog } from "../../src/catalog/import-catalog.js";
import { readCatalogManifest, type CatalogManifest } from "../../src/catalog/manifest.js";
import type { AuthConfig, DatabaseConfig } from "../../src/config/environment.js";
import { closeDatabaseConnection, createDatabaseConnection, type DatabaseConnection, verifyDatabaseConnection } from "../../src/db/client.js";
import { dailyUsage } from "../../src/db/schema/analytics.js";
import { refreshSessions, userPreferences, users } from "../../src/db/schema/identity.js";
import { aiJobAttempts, imageUploads, photoFeedbacks } from "../../src/db/schema/jobs.js";
import { PhotoFeedbackProviderError, type PhotoFeedbackProvider, type PhotoFeedbackProviderInput } from "../../src/photo-feedback/photo-feedback-provider.js";
import { ProviderPhotoFeedbackProcessor, type PhotoFeedbackProcessor, type PhotoFeedbackResult } from "../../src/photo-feedback/photo-feedback-processor.js";
import { PhotoFeedbackService } from "../../src/photo-feedback/photo-feedback-service.js";
import { PhotoFeedbackWorker } from "../../src/photo-feedback/photo-feedback-worker.js";
import { IdempotencyService } from "../../src/reliability/idempotency-service.js";
import { UsageLimitService } from "../../src/reliability/usage-limit-service.js";
import { ImageStorage } from "../../src/uploads/image-storage.js";
import { UploadService } from "../../src/uploads/upload-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for database tests.");
const databaseConfig: DatabaseConfig = { connectionString: databaseUrl, maxConnections: 6, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 5_000 };
const authConfig: AuthConfig = {
  accessTokenSecret: "photo-feedback-test-secret-with-at-least-32-characters",
  issuer: "dearshot-api-feedback-test", audience: "dearshot-android-feedback-test",
  accessTokenTtlSeconds: 900, refreshTokenTtlSeconds: 2_592_000,
};
const logger = pino({ level: "silent" });
const catalogRoot = path.resolve("catalog");
let connection: DatabaseConnection;
let tokenService: TokenService;
let manifest: CatalogManifest;
let uploadRoot: string;
let storage: ImageStorage;
let uploadService: UploadService;

class TestProvider implements PhotoFeedbackProvider {
  readonly providerName = "test-provider";
  readonly modelName = "test-model";
  lastInput: PhotoFeedbackProviderInput | undefined;

  constructor(private readonly invalidPair = false) {}

  async evaluate(input: PhotoFeedbackProviderInput) {
    this.lastInput = input;
    return {
      decision: {
        category: this.invalidPair ? "POSE" as const : "COMPOSITION" as const,
        actionCode: input.previous ? "KEEP_CURRENT" as const : "MOVE_SUBJECT_LEFT" as const,
        strength: "SMALL" as const,
        confidence: 0.91,
        improvedFromPrevious: input.previous ? true : null,
      },
      usage: { inputTokens: 200, outputTokens: 20 },
    };
  }
}

class DeferredProcessor implements PhotoFeedbackProcessor {
  readonly started = deferred<void>();
  readonly release = deferred<void>();

  async process(): Promise<PhotoFeedbackResult> {
    this.started.resolve();
    await this.release.promise;
    return {
      primary: {
        category: "COMPOSITION", actionCode: "KEEP_CURRENT", strength: "SMALL",
        messageKey: "feedback.keep_current", confidence: 0.9,
      },
      comparison: { available: false, improvedFromPrevious: null },
      retakeRecommended: false,
      retakeIndex: 0,
      source: "deferred-test",
    };
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function createPrincipal() {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await connection.db.insert(users).values({ id: userId, accountType: "GUEST" });
  await connection.db.insert(userPreferences).values({ userId, locale: "ko-KR" });
  await connection.db.insert(refreshSessions).values({
    id: sessionId, userId, installationId: randomUUID(), tokenHash: randomBytes(32).toString("hex"),
    tokenFamilyId: randomUUID(), expiresAt: new Date(Date.now() + 60_000),
  });
  const accessToken = await tokenService.issueAccessToken({ sub: userId, sid: sessionId, principalType: "GUEST", role: "USER" });
  return { userId, token: accessToken.token };
}

async function createUpload(ownerUserId: string) {
  const id = randomUUID();
  const storagePath = `objects/aa/${randomBytes(24).toString("hex")}.jpg`;
  const absolutePath = path.join(uploadRoot, storagePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, Buffer.from("private-feedback-image"));
  await connection.db.insert(imageUploads).values({
    id, ownerUserId, purpose: "PHOTO_FEEDBACK", storagePath, contentType: "image/jpeg",
    byteSize: 22, sha256: randomBytes(32).toString("hex"), width: 1080, height: 1440,
    expiresAt: new Date(Date.now() + 60_000),
  });
  return { id, storagePath, absolutePath };
}

function payload(uploadId: string, previousFeedbackId?: string) {
  return {
    uploadId, previousFeedbackId, locale: "ko-KR",
    template: { id: "dev-beach-breeze", version: 1 },
    capture: { aspectRatio: "9:16", orientation: "PORTRAIT", guideEnabled: true },
  };
}

function context() {
  const idempotency = new IdempotencyService(connection.db);
  const service = new PhotoFeedbackService(
    connection.db, uploadService, idempotency,
    new UsageLimitService(connection.db, {
      timezone: "UTC", guest: { sceneAnalysesPerDay: 5, photoFeedbacksPerDay: 10 },
      member: { sceneAnalysesPerDay: 50, photoFeedbacksPerDay: 100 },
    }),
    { retentionDays: 7, maxAttempts: 1, pollAfterMillis: 500 },
  );
  return {
    app: createApp({ logger, checkDatabase: () => verifyDatabaseConnection(connection.pool), photoFeedback: { service, tokenService } }),
  };
}

function worker(provider: PhotoFeedbackProvider) {
  return new PhotoFeedbackWorker(
    connection.db,
    new ProviderPhotoFeedbackProcessor(connection.db, storage, provider),
    {
      pollIntervalMillis: 10, leaseSeconds: 30, retryBaseSeconds: 1,
      onTerminal: ({ uploadId, storagePath }) => uploadService.purgeConsumed(uploadId, storagePath),
    },
    logger,
  );
}

async function createFeedback(app: ReturnType<typeof createApp>, token: string, uploadId: string, previousFeedbackId?: string) {
  return request(app).post("/api/v1/photo-feedbacks")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", randomUUID())
    .send(payload(uploadId, previousFeedbackId));
}

describe("photo feedback pipeline", { concurrency: 1 }, () => {
  before(async () => {
    connection = createDatabaseConnection(databaseConfig, logger);
    tokenService = new TokenService(authConfig);
    manifest = await readCatalogManifest(path.join(catalogRoot, "seed.json"));
    uploadRoot = await mkdtemp(path.join(os.tmpdir(), "dearshot-feedback-test-"));
    storage = new ImageStorage({ root: uploadRoot, maxBytes: 10_485_760, maxDimensionPixels: 8_192, maxPixels: 40_000_000 });
    uploadService = new UploadService(connection.db, storage, { ttlSeconds: 3_600 }, new IdempotencyService(connection.db));
    await Promise.all([verifyDatabaseConnection(connection.pool), storage.ready()]);
  });

  beforeEach(async () => {
    await connection.db.execute(sql`
      truncate table ai_job_attempts, photo_feedbacks, scene_analysis_events, scene_analyses,
      image_uploads, idempotency_records, daily_usage, oauth_nonce_uses, auth_identities,
      refresh_sessions, user_preferences, users, catalog_state, template_version_localizations,
      template_scenes, template_versions, templates, scene_localizations, scenes restart identity cascade
    `);
    await importCatalog(connection.db, manifest, { assetRoot: path.join(catalogRoot, "assets") });
  });

  after(async () => {
    await closeDatabaseConnection(connection.pool);
    await rm(uploadRoot, { recursive: true, force: true });
  });

  it("creates idempotently, charges once, and allows an idempotent cancellation", async () => {
    const principal = await createPrincipal();
    const upload = await createUpload(principal.userId);
    const { app } = context();
    const key = randomUUID();
    const first = await request(app).post("/api/v1/photo-feedbacks")
      .set("Authorization", `Bearer ${principal.token}`).set("Idempotency-Key", key).send(payload(upload.id));
    const replay = await request(app).post("/api/v1/photo-feedbacks")
      .set("Authorization", `Bearer ${principal.token}`).set("Idempotency-Key", key).send(payload(upload.id));
    assert.equal(first.status, 202, JSON.stringify(first.body));
    assert.equal(replay.headers["idempotency-replayed"], "true");
    assert.equal(replay.body.feedbackId, first.body.feedbackId);
    const [usage] = await connection.db.select().from(dailyUsage).where(eq(dailyUsage.userId, principal.userId));
    assert.equal(usage.photoFeedbackCount, 1);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const cancelled = await request(app).delete(`/api/v1/photo-feedbacks/${first.body.feedbackId}`)
        .set("Authorization", `Bearer ${principal.token}`);
      assert.equal(cancelled.status, 204);
    }
    const [feedback] = await connection.db.select().from(photoFeedbacks).where(eq(photoFeedbacks.id, first.body.feedbackId));
    assert.equal(feedback.status, "CANCELLED");
    await assert.rejects(access(upload.absolutePath));
  });

  it("returns one stable action and compares a retake in the next provider call", async () => {
    const principal = await createPrincipal();
    const { app } = context();
    const firstUpload = await createUpload(principal.userId);
    const first = await createFeedback(app, principal.token, firstUpload.id);
    assert.equal(first.status, 202, JSON.stringify(first.body));
    const firstProvider = new TestProvider();
    assert.equal(await worker(firstProvider).runOnce(), true);

    const secondUpload = await createUpload(principal.userId);
    const second = await createFeedback(app, principal.token, secondUpload.id, first.body.feedbackId);
    assert.equal(second.status, 202, JSON.stringify(second.body));
    const secondProvider = new TestProvider();
    assert.equal(await worker(secondProvider).runOnce(), true);

    const [stored] = await connection.db.select().from(photoFeedbacks).where(eq(photoFeedbacks.id, second.body.feedbackId));
    const [attempt] = await connection.db.select().from(aiJobAttempts).where(eq(aiJobAttempts.photoFeedbackId, second.body.feedbackId));
    assert.equal(stored.status, "COMPLETED");
    assert.equal(stored.retakeIndex, 1);
    assert.deepEqual(stored.result?.primary, {
      category: "COMPOSITION", actionCode: "KEEP_CURRENT", strength: "SMALL",
      messageKey: "feedback.keep_current", confidence: 0.91,
    });
    assert.deepEqual(stored.result?.comparison, { available: true, improvedFromPrevious: true });
    assert.equal(secondProvider.lastInput?.previous?.actionCode, "MOVE_SUBJECT_LEFT");
    assert.equal(attempt.status, "SUCCEEDED");
    assert.equal(attempt.inputTokens, 200);
    const [upload] = await connection.db.select().from(imageUploads).where(eq(imageUploads.id, secondUpload.id));
    assert.equal(upload.status, "DELETED");
    await assert.rejects(access(secondUpload.absolutePath));
  });

  it("rejects a mismatched action/category pair and deletes the terminal image", async () => {
    const principal = await createPrincipal();
    const upload = await createUpload(principal.userId);
    const { app } = context();
    const created = await createFeedback(app, principal.token, upload.id);
    assert.equal(created.status, 202);
    assert.equal(await worker(new TestProvider(true)).runOnce(), true);
    const [feedback] = await connection.db.select().from(photoFeedbacks).where(eq(photoFeedbacks.id, created.body.feedbackId));
    const [attempt] = await connection.db.select().from(aiJobAttempts).where(eq(aiJobAttempts.photoFeedbackId, created.body.feedbackId));
    assert.equal(feedback.status, "FAILED");
    assert.equal(feedback.failureCode, "PROVIDER_SELECTED_INVALID_FEEDBACK_ACTION");
    assert.equal(attempt.failurePhase, "VALIDATION");
    await assert.rejects(access(upload.absolutePath));
  });

  it("fences a late worker result after cancellation", async () => {
    const principal = await createPrincipal();
    const upload = await createUpload(principal.userId);
    const { app } = context();
    const created = await createFeedback(app, principal.token, upload.id);
    const processor = new DeferredProcessor();
    const feedbackWorker = new PhotoFeedbackWorker(connection.db, processor, {
      pollIntervalMillis: 10, leaseSeconds: 30, retryBaseSeconds: 1,
      onTerminal: ({ uploadId, storagePath }) => uploadService.purgeConsumed(uploadId, storagePath),
    }, logger);
    const running = feedbackWorker.runOnce();
    await processor.started.promise;
    const cancelled = await request(app).delete(`/api/v1/photo-feedbacks/${created.body.feedbackId}`)
      .set("Authorization", `Bearer ${principal.token}`);
    assert.equal(cancelled.status, 204);
    processor.release.resolve();
    assert.equal(await running, true);
    const [feedback] = await connection.db.select().from(photoFeedbacks).where(eq(photoFeedbacks.id, created.body.feedbackId));
    assert.equal(feedback.status, "CANCELLED");
    assert.equal(feedback.result, null);
    await assert.rejects(access(upload.absolutePath));
  });
});

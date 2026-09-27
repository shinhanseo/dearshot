import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { AccountDeletionWorker } from "../../src/account/account-deletion-worker.js";
import { AccountService } from "../../src/account/account-service.js";
import { createApp } from "../../src/app.js";
import { TokenService } from "../../src/auth/token-service.js";
import type { AuthConfig, DatabaseConfig } from "../../src/config/environment.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  type DatabaseConnection,
  verifyDatabaseConnection,
} from "../../src/db/client.js";
import { appEvents } from "../../src/db/schema/analytics.js";
import {
  accountDeletionRequests,
  refreshSessions,
  userPreferences,
  users,
} from "../../src/db/schema/identity.js";
import { aiJobAttempts, imageUploads, sceneAnalyses } from "../../src/db/schema/jobs.js";
import { RetentionWorker } from "../../src/privacy/retention-worker.js";
import { ImageStorage } from "../../src/uploads/image-storage.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for database tests.");
const databaseConfig: DatabaseConfig = {
  connectionString: databaseUrl,
  maxConnections: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
};
const authConfig: AuthConfig = {
  accessTokenSecret: "privacy-test-secret-with-at-least-32-characters",
  issuer: "dearshot-api-privacy-test",
  audience: "dearshot-android-privacy-test",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
};
const logger = pino({ level: "silent" });
let connection: DatabaseConnection;
let tokenService: TokenService;
let uploadRoot: string;
let storage: ImageStorage;

async function member(now: Date) {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await connection.db.insert(users).values({ id: userId, accountType: "MEMBER" });
  await connection.db.insert(userPreferences).values({ userId, locale: "ko-KR" });
  await connection.db.insert(refreshSessions).values({
    id: sessionId,
    userId,
    installationId: randomUUID(),
    tokenHash: randomBytes(32).toString("hex"),
    tokenFamilyId: randomUUID(),
    expiresAt: new Date(now.getTime() + 86_400_000),
  });
  const token = await tokenService.issueAccessToken({
    sub: userId,
    sid: sessionId,
    principalType: "MEMBER",
    role: "USER",
  }, now);
  return { userId, sessionId, token: token.token };
}

async function storedUpload(userId: string, now: Date, status: "READY" | "CONSUMED" = "READY") {
  const id = randomUUID();
  const storagePath = `objects/aa/${randomBytes(24).toString("hex")}.jpg`;
  const absolutePath = path.join(uploadRoot, storagePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, "private-image");
  await connection.db.insert(imageUploads).values({
    id,
    ownerUserId: userId,
    purpose: "SCENE_ANALYSIS",
    storagePath,
    contentType: "image/jpeg",
    byteSize: 13,
    sha256: randomBytes(32).toString("hex"),
    width: 1080,
    height: 1440,
    status,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 3_600_000),
    consumedAt: status === "CONSUMED" ? now : null,
  });
  return { id, storagePath, absolutePath };
}

describe("privacy retention and account deletion", { concurrency: 1 }, () => {
  before(async () => {
    connection = createDatabaseConnection(databaseConfig, logger);
    tokenService = new TokenService(authConfig);
    uploadRoot = await mkdtemp(path.join(os.tmpdir(), "dearshot-privacy-test-"));
    storage = new ImageStorage({
      root: uploadRoot,
      maxBytes: 10_485_760,
      maxDimensionPixels: 8_192,
      maxPixels: 40_000_000,
    });
    await Promise.all([verifyDatabaseConnection(connection.pool), storage.ready()]);
  });

  beforeEach(async () => {
    await connection.db.execute(sql`
      truncate table account_deletion_requests, ai_job_attempts, photo_feedbacks,
      scene_analyses, image_uploads, app_events, idempotency_records, daily_usage,
      oauth_nonce_uses, auth_identities, refresh_sessions, user_preferences, users
      restart identity cascade
    `);
    await rm(uploadRoot, { recursive: true, force: true });
    storage = new ImageStorage({
      root: uploadRoot,
      maxBytes: 10_485_760,
      maxDimensionPixels: 8_192,
      maxPixels: 40_000_000,
    });
    await storage.ready();
  });

  after(async () => {
    await Promise.all([closeDatabaseConnection(connection.pool), rm(uploadRoot, { recursive: true, force: true })]);
  });

  it("updates member preferences and erases files before completing account deletion", async () => {
    const now = new Date();
    const principal = await member(now);
    const upload = await storedUpload(principal.userId, now, "CONSUMED");
    await connection.db.insert(sceneAnalyses).values({
      id: randomUUID(),
      ownerUserId: principal.userId,
      uploadId: upload.id,
      status: "QUEUED",
      sceneRevision: 1,
      capturedAt: now,
      locale: "ko-KR",
      deviceAnalysis: { sceneClassifier: { model: "places365", modelVersion: "1", runtime: "onnx", candidates: [] } },
      timezone: "Asia/Seoul",
      latitude: 37.5,
      longitude: 127,
      locationAccuracyMeters: 30,
      expiresAt: new Date(now.getTime() + 7 * 86_400_000),
    });
    const service = new AccountService(connection.db, 7, () => now);
    const app = createApp({
      logger,
      checkDatabase: () => verifyDatabaseConnection(connection.pool),
      account: { service, tokenService },
    });

    const preferences = await request(app).patch("/api/v1/me/preferences")
      .set("Authorization", `Bearer ${principal.token}`)
      .send({ locale: "en-US", defaultAspectRatio: "9:16", allowLocationContext: true });
    assert.equal(preferences.status, 200);
    assert.equal(preferences.body.locale, "en-US");

    const deletion = await request(app).delete("/api/v1/me")
      .set("Authorization", `Bearer ${principal.token}`);
    assert.equal(deletion.status, 202);
    assert.equal(deletion.body.status, "PENDING");

    const [blockedUser] = await connection.db.select().from(users).where(eq(users.id, principal.userId));
    assert.equal(blockedUser.status, "DELETION_PENDING");
    const [cancelled] = await connection.db.select().from(sceneAnalyses);
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.deviceAnalysis, null);
    assert.equal(cancelled.latitude, null);

    const blockedPatch = await request(app).patch("/api/v1/me/preferences")
      .set("Authorization", `Bearer ${principal.token}`)
      .send({ locale: "ko-KR" });
    assert.equal(blockedPatch.status, 401);

    const worker = new AccountDeletionWorker(
      connection.db,
      storage,
      { pollIntervalMillis: 10, leaseSeconds: 30, retryBaseSeconds: 1 },
      logger,
      "deletion-test-worker",
      () => now,
    );
    assert.equal(await worker.runOnce(), true);
    await assert.rejects(access(upload.absolutePath));
    const [deletedUser] = await connection.db.select().from(users).where(eq(users.id, principal.userId));
    assert.equal(deletedUser, undefined);

    const status = await request(app).get(`/api/v1/account-deletions/${deletion.body.deletionId}`)
      .set("Authorization", `Bearer ${principal.token}`);
    assert.equal(status.status, 200);
    assert.equal(status.body.status, "COMPLETED");
  });

  it("enforces image, result, AI audit, and product-event retention with a controlled clock", async () => {
    const createdAt = new Date("2026-08-01T00:00:00.000Z");
    const firstRunAt = new Date("2026-08-09T00:00:00.000Z");
    const principal = await member(createdAt);
    const upload = await storedUpload(principal.userId, createdAt, "CONSUMED");
    const analysisId = randomUUID();
    await connection.db.insert(sceneAnalyses).values({
      id: analysisId,
      ownerUserId: principal.userId,
      uploadId: upload.id,
      status: "COMPLETED",
      sceneRevision: 1,
      capturedAt: createdAt,
      locale: "ko-KR",
      result: { outcome: "RECOMMENDED" },
      completedAt: createdAt,
      expiresAt: new Date(createdAt.getTime() + 7 * 86_400_000),
    });
    await connection.db.insert(aiJobAttempts).values({
      ownerUserId: principal.userId,
      sceneAnalysisId: analysisId,
      attemptNumber: 1,
      requestId: randomUUID(),
      provider: "test",
      model: "test",
      promptVersion: "v1",
      schemaVersion: "v1",
      status: "SUCCEEDED",
      startedAt: createdAt,
      completedAt: createdAt,
    });
    await connection.db.insert(aiJobAttempts).values({
      ownerUserId: principal.userId,
      sceneAnalysisId: analysisId,
      attemptNumber: 2,
      requestId: randomUUID(),
      provider: "test",
      model: "test",
      promptVersion: "v1",
      schemaVersion: "v1",
      status: "STARTED",
      startedAt: new Date(createdAt.getTime() + 1_000),
    });
    await connection.db.insert(appEvents).values({
      eventId: randomUUID(),
      actorId: principal.userId,
      actorType: "MEMBER",
      sessionId: principal.sessionId,
      eventName: "capture_completed",
      appVersion: "1.0.0",
      osVersion: "16",
      locale: "ko-KR",
      properties: {},
      requestId: randomUUID(),
      occurredAt: createdAt,
      receivedAt: createdAt,
      expiresAt: firstRunAt,
    });

    const retention = (clock: Date) => new RetentionWorker(
      connection.db,
      storage,
      {
        intervalMillis: 60_000,
        uploadMaximumAgeSeconds: 3_600,
        aiAttemptRetentionDays: 30,
        temporaryFileGraceSeconds: 3_600,
      },
      logger,
      () => clock,
    );
    const summary = await retention(firstRunAt).runOnce();
    assert.equal(summary.expiredUploads, 1);
    await assert.rejects(access(upload.absolutePath));
    assert.equal((await connection.db.select().from(sceneAnalyses)).length, 0);
    const audits = await connection.db.select().from(aiJobAttempts);
    assert.equal(audits.length, 2);
    assert.ok(audits.every((audit) => audit.sceneAnalysisId === null));
    assert.equal(audits.find((audit) => audit.attemptNumber === 2)?.errorCode, "RETENTION_EXPIRED");
    assert.equal((await connection.db.select().from(appEvents)).length, 0);

    await retention(new Date("2026-09-01T00:00:01.000Z")).runOnce();
    assert.equal((await connection.db.select().from(aiJobAttempts)).length, 0);
  });

  it("keeps deletion pending and retryable when file quarantine fails", async () => {
    const now = new Date("2026-09-27T12:00:00.000Z");
    const principal = await member(now);
    await storedUpload(principal.userId, now);
    const service = new AccountService(connection.db, 7, () => now);
    const deletion = await service.requestDeletion({
      sub: principal.userId,
      sid: principal.sessionId,
      principalType: "MEMBER",
      role: "USER",
      jti: randomUUID(),
    });
    const worker = new AccountDeletionWorker(
      connection.db,
      { quarantine: async () => { throw new Error("disk unavailable"); } },
      { pollIntervalMillis: 10, leaseSeconds: 30, retryBaseSeconds: 5 },
      logger,
      "failure-worker",
      () => now,
    );
    assert.equal(await worker.runOnce(), true);
    const [requestRow] = await connection.db.select().from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, deletion.deletionId));
    assert.equal(requestRow.status, "PENDING");
    assert.equal(requestRow.attemptCount, 1);
    assert.equal(requestRow.lastErrorCode, "ACCOUNT_DELETION_FAILED");
    assert.ok(requestRow.nextAttemptAt > now);
    assert.equal((await connection.db.select().from(users)).length, 1);
  });
});

import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import { importCatalog } from "../../src/catalog/import-catalog.js";
import { readCatalogManifest, type CatalogManifest } from "../../src/catalog/manifest.js";
import type { DatabaseConfig } from "../../src/config/environment.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  type DatabaseConnection,
  verifyDatabaseConnection,
} from "../../src/db/client.js";
import { users } from "../../src/db/schema/identity.js";
import { aiJobAttempts, imageUploads, sceneAnalyses } from "../../src/db/schema/jobs.js";
import { SceneRecommendationProcessor } from "../../src/scene-analysis/scene-recommendation-processor.js";
import type {
  SceneRecommendationInput,
  SceneRecommendationProvider,
} from "../../src/scene-analysis/scene-recommendation-provider.js";
import { SceneTemplateCandidateService } from "../../src/scene-analysis/scene-template-candidate-service.js";
import { SceneAnalysisWorker } from "../../src/scene-analysis/scene-analysis-worker.js";
import { ImageStorage } from "../../src/uploads/image-storage.js";
import { UploadService } from "../../src/uploads/upload-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for database tests.");
const config: DatabaseConfig = {
  connectionString: databaseUrl,
  maxConnections: 4,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
};
const logger = pino({ level: "silent" });
const catalogRoot = path.resolve("catalog");
let connection: DatabaseConnection;
let manifest: CatalogManifest;
let uploadRoot: string;
let storage: ImageStorage;

class TestProvider implements SceneRecommendationProvider {
  readonly providerName = "test-provider";
  readonly modelName = "test-model";
  lastInput: SceneRecommendationInput | undefined;

  constructor(
    private readonly confidence = 0.9,
    private readonly disallowed = false,
  ) {}

  async recommend(input: SceneRecommendationInput) {
    this.lastInput = input;
    const selected = input.candidates[0]!;
    return {
      recommendation: {
        sceneKey: this.disallowed ? "invented-scene" : selected.sceneKeys[0]!,
        templateId: this.disallowed ? "invented-template" : selected.templateId,
        templateVersion: selected.templateVersion,
        confidence: this.confidence,
        reasonCode: "SCENE_MATCH" as const,
      },
      usage: { inputTokens: 120, outputTokens: 16 },
    };
  }
}

async function createQueuedAnalysis() {
  const userId = randomUUID();
  const uploadId = randomUUID();
  const analysisId = randomUUID();
  const storagePath = `objects/aa/${randomBytes(24).toString("hex")}.jpg`;
  const absolutePath = path.join(uploadRoot, storagePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, Buffer.from("private-image-bytes"));
  await connection.db.insert(users).values({ id: userId, accountType: "GUEST" });
  await connection.db.insert(imageUploads).values({
    id: uploadId,
    ownerUserId: userId,
    purpose: "SCENE_ANALYSIS",
    storagePath,
    contentType: "image/jpeg",
    byteSize: 19,
    sha256: randomBytes(32).toString("hex"),
    width: 1080,
    height: 1440,
    status: "CONSUMED",
    consumedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  await connection.db.insert(sceneAnalyses).values({
    id: analysisId,
    ownerUserId: userId,
    uploadId,
    sceneRevision: 4,
    capturedAt: new Date("2026-09-27T05:30:00Z"),
    locale: "ko-KR",
    timezone: "Asia/Seoul",
    deviceAnalysis: {
      sceneClassifier: {
        model: "resnet18-places365",
        modelVersion: "1",
        runtime: "onnxruntime-android",
        candidates: [{ label: "beach", confidence: 0.91 }],
      },
      objectDetector: {
        model: "yolox-nano",
        modelVersion: "1",
        runtime: "onnxruntime-android",
        objects: [{
          label: "person",
          confidence: 0.88,
          box: { left: 0.3, top: 0.2, right: 0.7, bottom: 0.9 },
        }],
      },
    },
    expiresAt: new Date(Date.now() + 60_000),
  });
  return { analysisId, uploadId, storagePath, absolutePath };
}

function worker(provider: SceneRecommendationProvider) {
  const uploadService = new UploadService(connection.db, storage, { ttlSeconds: 3_600 });
  const processor = new SceneRecommendationProcessor(
    connection.db,
    storage,
    new SceneTemplateCandidateService(connection.db, 12),
    provider,
    { minimumConfidence: 0.55 },
  );
  return new SceneAnalysisWorker(connection.db, processor, {
    pollIntervalMillis: 10,
    leaseSeconds: 30,
    retryBaseSeconds: 1,
    onTerminal: ({ uploadId, storagePath }) => uploadService.purgeConsumed(uploadId, storagePath),
  }, logger);
}

describe("scene recommendation pipeline", { concurrency: 1 }, () => {
  before(async () => {
    connection = createDatabaseConnection(config, logger);
    manifest = await readCatalogManifest(path.join(catalogRoot, "seed.json"));
    uploadRoot = await mkdtemp(path.join(os.tmpdir(), "dearshot-recommendation-test-"));
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
      truncate table ai_job_attempts, scene_analyses, image_uploads,
      idempotency_records, daily_usage, oauth_nonce_uses, auth_identities,
      refresh_sessions, user_preferences, users, catalog_state,
      template_version_localizations, template_scenes, template_versions, templates,
      scene_localizations, scenes restart identity cascade
    `);
    await importCatalog(connection.db, manifest, { assetRoot: path.join(catalogRoot, "assets") });
  });

  after(async () => {
    await closeDatabaseConnection(connection.pool);
    await rm(uploadRoot, { recursive: true, force: true });
  });

  it("selects only a published candidate, records usage, and deletes the private image", async () => {
    const job = await createQueuedAnalysis();
    const provider = new TestProvider();
    assert.equal(await worker(provider).runOnce(), true);

    const [analysis] = await connection.db.select().from(sceneAnalyses)
      .where(eq(sceneAnalyses.id, job.analysisId));
    const [attempt] = await connection.db.select().from(aiJobAttempts)
      .where(eq(aiJobAttempts.sceneAnalysisId, job.analysisId));
    const [upload] = await connection.db.select().from(imageUploads)
      .where(eq(imageUploads.id, job.uploadId));
    assert.equal(analysis.status, "COMPLETED");
    assert.equal(analysis.deviceAnalysis, null);
    assert.equal(analysis.timezone, null);
    assert.equal(analysis.latitude, null);
    assert.equal(analysis.longitude, null);
    assert.equal(attempt.status, "SUCCEEDED");
    assert.equal(attempt.inputTokens, 120);
    assert.equal(upload.status, "DELETED");
    await assert.rejects(access(job.absolutePath));
    assert.ok(provider.lastInput?.candidates.every((candidate) => candidate.templateVersion === 1));
  });

  it("uses a terminal manual-selection state when confidence is too low", async () => {
    const job = await createQueuedAnalysis();
    assert.equal(await worker(new TestProvider(0.3)).runOnce(), true);
    const [analysis] = await connection.db.select().from(sceneAnalyses)
      .where(eq(sceneAnalyses.id, job.analysisId));
    assert.equal(analysis.status, "NEEDS_USER_SELECTION");
    assert.equal(analysis.result?.outcome, "NEEDS_USER_SELECTION");
    assert.equal(analysis.result?.reasonCode, "LOW_RECOMMENDATION_CONFIDENCE");
  });

  it("rejects a provider choice outside the server allowlist and records the failure", async () => {
    const job = await createQueuedAnalysis();
    assert.equal(await worker(new TestProvider(0.9, true)).runOnce(), true);
    const [analysis] = await connection.db.select().from(sceneAnalyses)
      .where(eq(sceneAnalyses.id, job.analysisId));
    const [attempt] = await connection.db.select().from(aiJobAttempts)
      .where(eq(aiJobAttempts.sceneAnalysisId, job.analysisId));
    assert.equal(analysis.status, "FAILED");
    assert.equal(analysis.failureCode, "PROVIDER_SELECTED_DISALLOWED_TEMPLATE");
    assert.equal(attempt.status, "FAILED");
    assert.equal(attempt.failurePhase, "VALIDATION");
  });
});

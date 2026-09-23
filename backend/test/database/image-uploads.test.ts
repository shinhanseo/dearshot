import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import sharp from "sharp";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { AuthService } from "../../src/auth/auth-service.js";
import { FakeGoogleIdentityVerifier } from "../../src/auth/google/fake-google-identity-verifier.js";
import { GoogleAuthService } from "../../src/auth/google/google-auth-service.js";
import { FakeKakaoIdentityVerifier } from "../../src/auth/kakao/fake-kakao-identity-verifier.js";
import { KakaoAuthService } from "../../src/auth/kakao/kakao-auth-service.js";
import { SocialIdentityAuthService } from "../../src/auth/social-identity-auth-service.js";
import { TokenService } from "../../src/auth/token-service.js";
import type { AuthConfig, DatabaseConfig } from "../../src/config/environment.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  type DatabaseConnection,
  verifyDatabaseConnection,
} from "../../src/db/client.js";
import { refreshSessions, userPreferences, users } from "../../src/db/schema/identity.js";
import { imageUploads } from "../../src/db/schema/jobs.js";
import { ImageStorage, type ImageStorageConfig } from "../../src/uploads/image-storage.js";
import { UploadService } from "../../src/uploads/upload-service.js";
import { IdempotencyService } from "../../src/reliability/idempotency-service.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for database tests.");

const databaseConfig: DatabaseConfig = {
  connectionString: databaseUrl,
  maxConnections: 8,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
};
const authConfig: AuthConfig = {
  accessTokenSecret: "upload-test-secret-with-at-least-32-characters",
  issuer: "dearshot-api-upload-test",
  audience: "dearshot-android-upload-test",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
};
const logger = pino({ level: "silent" });
let connection: DatabaseConnection;
let tokenService: TokenService;
let uploadRoot: string | undefined;

async function createPrincipal(accountType: "GUEST" | "MEMBER" = "MEMBER") {
  const userId = randomUUID();
  const sessionId = randomUUID();
  await connection.db.insert(users).values({ id: userId, accountType });
  await connection.db.insert(userPreferences).values({ userId, locale: "ko-KR" });
  await connection.db.insert(refreshSessions).values({
    id: sessionId,
    userId,
    installationId: randomUUID(),
    tokenHash: randomBytes(32).toString("hex"),
    tokenFamilyId: randomUUID(),
    expiresAt: new Date(Date.now() + 60_000),
  });
  const access = await tokenService.issueAccessToken({
    sub: userId,
    sid: sessionId,
    principalType: accountType,
    role: "USER",
  });
  return { userId, sessionId, token: access.token };
}

async function createUploadApp(overrides: Partial<ImageStorageConfig> = {}) {
  uploadRoot = await mkdtemp(path.join(os.tmpdir(), "dearshot-upload-test-"));
  const storage = new ImageStorage({
    root: uploadRoot,
    maxBytes: 10_485_760,
    maxDimensionPixels: 8_192,
    maxPixels: 40_000_000,
    ...overrides,
  });
  const uploadService = new UploadService(
    connection.db,
    storage,
    { ttlSeconds: 3_600 },
    new IdempotencyService(connection.db),
  );
  const authService = new AuthService(connection.db, tokenService, authConfig);
  const identityService = new SocialIdentityAuthService(
    connection.db,
    tokenService,
    authConfig,
  );
  const app = createApp({
    logger,
    checkDatabase: () => verifyDatabaseConnection(connection.pool),
    auth: {
      authService,
      googleAuthService: new GoogleAuthService(
        new FakeGoogleIdentityVerifier(new Map()),
        identityService,
      ),
      kakaoAuthService: new KakaoAuthService(
        new FakeKakaoIdentityVerifier(new Map()),
        identityService,
      ),
      tokenService,
    },
    uploads: { service: uploadService, storage, tokenService },
  });
  return { app, storage, uploadService, root: uploadRoot };
}

async function filesBelow(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? filesBelow(target) : [target];
    }),
  );
  return nested.flat();
}

describe("temporary image uploads", { concurrency: 1 }, () => {
  before(async () => {
    connection = createDatabaseConnection(databaseConfig, logger);
    tokenService = new TokenService(authConfig);
    await verifyDatabaseConnection(connection.pool);
  });

  beforeEach(async () => {
    await connection.db.execute(sql`
      truncate table image_uploads, oauth_nonce_uses, auth_identities, refresh_sessions,
      user_preferences, users restart identity cascade
    `);
  });

  afterEach(async () => {
    if (uploadRoot) await rm(uploadRoot, { recursive: true, force: true });
    uploadRoot = undefined;
  });

  after(async () => closeDatabaseConnection(connection.pool));

  it("sanitizes a valid image to a random private path and returns only public metadata", async () => {
    const principal = await createPrincipal("GUEST");
    const { app, root } = await createUploadApp();
    const jpeg = await sharp({
      create: { width: 32, height: 24, channels: 3, background: "#d45b42" },
    })
      .jpeg()
      .withExif({ IFD0: { Artist: "private-device-owner" } })
      .toBuffer();
    assert.ok((await sharp(jpeg).metadata()).exif);

    const response = await request(app)
      .post("/api/v1/uploads")
      .set("Idempotency-Key", randomUUID())
      .set("Authorization", `Bearer ${principal.token}`)
      .field("purpose", "SCENE_ANALYSIS")
      .attach("image", jpeg, { filename: "../../private.jpg", contentType: "image/jpeg" });

    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.deepEqual(Object.keys(response.body).sort(), [
      "byteSize",
      "contentType",
      "expiresAt",
      "height",
      "purpose",
      "status",
      "uploadId",
      "width",
    ]);
    assert.equal(response.body.status, "READY");
    assert.equal(response.body.purpose, "SCENE_ANALYSIS");
    assert.equal(response.body.contentType, "image/jpeg");
    assert.equal(response.body.width, 32);
    assert.equal(response.body.height, 24);
    assert.ok(Date.parse(response.body.expiresAt) > Date.now());
    assert.equal(JSON.stringify(response.body).includes("storage"), false);
    assert.equal(JSON.stringify(response.body).includes("sha256"), false);

    const [stored] = await connection.db
      .select()
      .from(imageUploads)
      .where(eq(imageUploads.id, response.body.uploadId));
    assert.equal(stored.ownerUserId, principal.userId);
    assert.match(stored.storagePath, /^objects\/[0-9a-f]{2}\/[0-9a-f]{48}\.jpg$/u);
    const absolute = path.resolve(root, stored.storagePath);
    assert.ok(absolute.startsWith(`${path.resolve(root)}${path.sep}`));
    const sanitized = await readFile(absolute);
    assert.notDeepEqual(sanitized, jpeg);
    assert.equal(response.body.byteSize, sanitized.length);
    assert.equal(stored.byteSize, sanitized.length);
    assert.equal(stored.sha256, createHash("sha256").update(sanitized).digest("hex"));
    const metadata = await sharp(sanitized).metadata();
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(metadata.iptc, undefined);
    assert.equal((await stat(absolute)).mode & 0o777, 0o600);
  });

  it("replays an upload with the same idempotency key and rejects changed content", async () => {
    const principal = await createPrincipal("GUEST");
    const { app, root } = await createUploadApp();
    const idempotencyKey = randomUUID();
    const jpeg = await sharp({
      create: { width: 32, height: 24, channels: 3, background: "#d45b42" },
    })
      .jpeg()
      .toBuffer();

    const upload = (purpose: "SCENE_ANALYSIS" | "PHOTO_FEEDBACK") =>
      request(app)
        .post("/api/v1/uploads")
        .set("Idempotency-Key", idempotencyKey)
        .set("Authorization", `Bearer ${principal.token}`)
        .field("purpose", purpose)
        .attach("image", jpeg, { filename: "photo.jpg", contentType: "image/jpeg" });

    const first = await upload("SCENE_ANALYSIS");
    const replay = await upload("SCENE_ANALYSIS");
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(replay.status, 201, JSON.stringify(replay.body));
    assert.equal(replay.headers["idempotency-replayed"], "true");
    assert.equal(replay.body.uploadId, first.body.uploadId);
    assert.equal((await filesBelow(root)).length, 1);

    const conflict = await upload("PHOTO_FEEDBACK");
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, "IDEMPOTENCY_CONFLICT");
    assert.equal((await filesBelow(root)).length, 1);
  });

  it("accepts WebP for a member and deletes only the owner's unused upload", async () => {
    const owner = await createPrincipal();
    const other = await createPrincipal();
    const { app, root } = await createUploadApp();
    const webp = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#89b9d8" },
    })
      .webp()
      .toBuffer();
    const uploaded = await request(app)
      .post("/api/v1/uploads")
      .set("Idempotency-Key", randomUUID())
      .set("Authorization", `Bearer ${owner.token}`)
      .field("purpose", "PHOTO_FEEDBACK")
      .attach("image", webp, { filename: "photo.webp", contentType: "image/webp" });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));

    const forbidden = await request(app)
      .delete(`/api/v1/uploads/${uploaded.body.uploadId}`)
      .set("Authorization", `Bearer ${other.token}`);
    assert.equal(forbidden.status, 404);
    assert.equal(forbidden.body.code, "RESOURCE_NOT_FOUND");
    assert.equal((await filesBelow(root)).length, 1);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const deleted = await request(app)
        .delete(`/api/v1/uploads/${uploaded.body.uploadId}`)
        .set("Authorization", `Bearer ${owner.token}`);
      assert.equal(deleted.status, 204, JSON.stringify(deleted.body));
    }
    const [stored] = await connection.db
      .select({ status: imageUploads.status, deletedAt: imageUploads.deletedAt })
      .from(imageUploads)
      .where(eq(imageUploads.id, uploaded.body.uploadId));
    assert.equal(stored.status, "DELETED");
    assert.ok(stored.deletedAt);
    assert.equal((await filesBelow(root)).length, 0);
  });

  it("rejects mismatched, unsupported, malformed, oversized, and oversized-dimension images cleanly", async () => {
    const principal = await createPrincipal();
    const validJpeg = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#ffffff" },
    })
      .jpeg()
      .toBuffer();

    let context = await createUploadApp();
    let response = await request(context.app)
      .post("/api/v1/uploads")
      .set("Idempotency-Key", randomUUID())
      .set("Authorization", `Bearer ${principal.token}`)
      .field("purpose", "SCENE_ANALYSIS")
      .attach("image", validJpeg, { filename: "fake.webp", contentType: "image/webp" });
    assert.equal(response.status, 422);
    assert.equal(response.body.code, "INVALID_IMAGE");
    assert.equal((await filesBelow(context.root)).length, 0);
    await rm(context.root, { recursive: true, force: true });

    context = await createUploadApp();
    response = await request(context.app)
      .post("/api/v1/uploads")
      .set("Idempotency-Key", randomUUID())
      .set("Authorization", `Bearer ${principal.token}`)
      .field("purpose", "SCENE_ANALYSIS")
      .attach("image", Buffer.from("not-a-png"), { filename: "x.png", contentType: "image/png" });
    assert.equal(response.status, 415);
    assert.equal(response.body.code, "UNSUPPORTED_MEDIA_TYPE");
    assert.equal((await filesBelow(context.root)).length, 0);
    await rm(context.root, { recursive: true, force: true });

    context = await createUploadApp();
    response = await request(context.app)
      .post("/api/v1/uploads")
      .set("Idempotency-Key", randomUUID())
      .set("Authorization", `Bearer ${principal.token}`)
      .field("purpose", "SCENE_ANALYSIS")
      .attach("image", Buffer.from([0xff, 0xd8, 0xff, 0x00]), {
        filename: "broken.jpg",
        contentType: "image/jpeg",
      });
    assert.equal(response.status, 422);
    assert.equal(response.body.code, "INVALID_IMAGE");
    assert.equal((await filesBelow(context.root)).length, 0);
    await rm(context.root, { recursive: true, force: true });

    context = await createUploadApp({ maxBytes: 1_024 });
    const oversized = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(2_048)]);
    response = await request(context.app)
      .post("/api/v1/uploads")
      .set("Idempotency-Key", randomUUID())
      .set("Authorization", `Bearer ${principal.token}`)
      .field("purpose", "SCENE_ANALYSIS")
      .attach("image", oversized, { filename: "large.jpg", contentType: "image/jpeg" });
    assert.equal(response.status, 413);
    assert.equal(response.body.code, "IMAGE_TOO_LARGE");
    assert.equal((await filesBelow(context.root)).length, 0);
    await rm(context.root, { recursive: true, force: true });

    context = await createUploadApp({ maxDimensionPixels: 64, maxPixels: 4_096 });
    response = await request(context.app)
      .post("/api/v1/uploads")
      .set("Idempotency-Key", randomUUID())
      .set("Authorization", `Bearer ${principal.token}`)
      .field("purpose", "SCENE_ANALYSIS")
      .attach("image", validJpeg, { filename: "wide.jpg", contentType: "image/jpeg" });
    assert.equal(response.status, 422);
    assert.equal(response.body.code, "IMAGE_DIMENSIONS_UNSUPPORTED");
    assert.equal((await filesBelow(context.root)).length, 0);

    const [metadataCount] = await connection.db
      .select({ value: sql<number>`count(*)::int` })
      .from(imageUploads);
    assert.equal(metadataCount.value, 0);
  });

  it("requires an exact multipart contract and an active session", async () => {
    const principal = await createPrincipal();
    const { app, root } = await createUploadApp();
    const jpeg = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#222222" },
    })
      .jpeg()
      .toBuffer();

    const missingIdempotencyKey = await request(app)
      .post("/api/v1/uploads")
      .set("Authorization", `Bearer ${principal.token}`)
      .field("purpose", "SCENE_ANALYSIS")
      .attach("image", jpeg, { filename: "photo.jpg", contentType: "image/jpeg" });
    assert.equal(missingIdempotencyKey.status, 400);
    assert.equal(missingIdempotencyKey.body.code, "INVALID_REQUEST");
    assert.equal((await filesBelow(root)).length, 0);

    const missingPurpose = await request(app)
      .post("/api/v1/uploads")
      .set("Idempotency-Key", randomUUID())
      .set("Authorization", `Bearer ${principal.token}`)
      .attach("image", jpeg, { filename: "photo.jpg", contentType: "image/jpeg" });
    assert.equal(missingPurpose.status, 400);
    assert.equal(missingPurpose.body.code, "INVALID_MULTIPART");
    assert.equal((await filesBelow(root)).length, 0);

    const duplicatePart = await request(app)
      .post("/api/v1/uploads")
      .set("Idempotency-Key", randomUUID())
      .set("Authorization", `Bearer ${principal.token}`)
      .field("purpose", "SCENE_ANALYSIS")
      .field("unexpected", "value")
      .attach("image", jpeg, { filename: "photo.jpg", contentType: "image/jpeg" });
    assert.equal(duplicatePart.status, 400);
    assert.equal(duplicatePart.body.code, "INVALID_MULTIPART");
    assert.equal((await filesBelow(root)).length, 0);

    const invalidPurpose = await request(app)
      .post("/api/v1/uploads")
      .set("Idempotency-Key", randomUUID())
      .set("Authorization", `Bearer ${principal.token}`)
      .field("purpose", "PROFILE_PHOTO")
      .attach("image", jpeg, { filename: "photo.jpg", contentType: "image/jpeg" });
    assert.equal(invalidPurpose.status, 400);
    assert.equal(invalidPurpose.body.code, "INVALID_PURPOSE");
    assert.equal((await filesBelow(root)).length, 0);

    await connection.db
      .update(refreshSessions)
      .set({ revokedAt: new Date() })
      .where(eq(refreshSessions.id, principal.sessionId));
    const revoked = await request(app)
      .post("/api/v1/uploads")
      .set("Idempotency-Key", randomUUID())
      .set("Authorization", `Bearer ${principal.token}`)
      .field("purpose", "SCENE_ANALYSIS")
      .attach("image", jpeg, { filename: "photo.jpg", contentType: "image/jpeg" });
    assert.equal(revoked.status, 401);
    assert.equal(revoked.body.code, "INVALID_TOKEN");
    assert.equal((await filesBelow(root)).length, 0);
  });

  it("removes a finalized file when metadata insertion fails", async () => {
    const { uploadService, root } = await createUploadApp();
    const storagePath = `objects/aa/${"a".repeat(48)}.jpg`;
    const absolutePath = path.join(root, storagePath);
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);

    await assert.rejects(() =>
      uploadService.createReady(randomUUID(), "SCENE_ANALYSIS", {
        storagePath,
        contentType: "image/jpeg",
        byteSize: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        width: 1,
        height: 1,
      }),
    );
    assert.equal((await filesBelow(root)).length, 0);
    const [metadataCount] = await connection.db
      .select({ value: sql<number>`count(*)::int` })
      .from(imageUploads);
    assert.equal(metadataCount.value, 0);
  });

  it("does not delete an upload already consumed by a later analysis job", async () => {
    const owner = await createPrincipal();
    const { app, root } = await createUploadApp();
    const jpeg = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#333333" },
    })
      .jpeg()
      .toBuffer();
    const uploaded = await request(app)
      .post("/api/v1/uploads")
      .set("Idempotency-Key", randomUUID())
      .set("Authorization", `Bearer ${owner.token}`)
      .field("purpose", "SCENE_ANALYSIS")
      .attach("image", jpeg, { filename: "photo.jpg", contentType: "image/jpeg" });
    await connection.db
      .update(imageUploads)
      .set({ status: "CONSUMED", consumedAt: new Date() })
      .where(eq(imageUploads.id, uploaded.body.uploadId));

    const response = await request(app)
      .delete(`/api/v1/uploads/${uploaded.body.uploadId}`)
      .set("Authorization", `Bearer ${owner.token}`);
    assert.equal(response.status, 409);
    assert.equal(response.body.code, "UPLOAD_ALREADY_USED");
    assert.equal((await filesBelow(root)).length, 1);
  });
});

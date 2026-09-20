import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { count, eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { AuthService } from "../../src/auth/auth-service.js";
import { FakeGoogleIdentityVerifier } from "../../src/auth/google/fake-google-identity-verifier.js";
import { GoogleAuthService } from "../../src/auth/google/google-auth-service.js";
import { FakeKakaoIdentityVerifier } from "../../src/auth/kakao/fake-kakao-identity-verifier.js";
import { KakaoAuthService } from "../../src/auth/kakao/kakao-auth-service.js";
import { SocialIdentityAuthService } from "../../src/auth/social-identity-auth-service.js";
import { TokenService } from "../../src/auth/token-service.js";
import { CatalogService } from "../../src/catalog/catalog-service.js";
import { importCatalog } from "../../src/catalog/import-catalog.js";
import { readCatalogManifest, type CatalogManifest } from "../../src/catalog/manifest.js";
import { TemplateInteractionService } from "../../src/catalog/template-interaction-service.js";
import type { AuthConfig, DatabaseConfig } from "../../src/config/environment.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  type DatabaseConnection,
  verifyDatabaseConnection,
} from "../../src/db/client.js";
import { templateBookmarks, templateLikes, templates } from "../../src/db/schema/catalog.js";
import { refreshSessions, userPreferences, users } from "../../src/db/schema/identity.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for database tests.");

const databaseConfig: DatabaseConfig = {
  connectionString: databaseUrl,
  maxConnections: 12,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
};
const authConfig: AuthConfig = {
  accessTokenSecret: "interaction-test-secret-with-at-least-32-characters",
  issuer: "dearshot-api-interaction-test",
  audience: "dearshot-android-interaction-test",
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 2_592_000,
};
const logger = pino({ level: "silent" });
const catalogRoot = path.resolve("catalog");
const assetRoot = path.join(catalogRoot, "assets");
let connection: DatabaseConnection;
let tokenService: TokenService;
let interactionService: TemplateInteractionService;
let manifest: CatalogManifest;

function testApp() {
  const authService = new AuthService(connection.db, tokenService, authConfig);
  const identityService = new SocialIdentityAuthService(
    connection.db,
    tokenService,
    authConfig,
  );
  return createApp({
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
    catalog: {
      service: new CatalogService(connection.db, "http://localhost:3000/assets/catalog"),
      assetRoot,
      interactionService,
    },
  });
}

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

function authorized(method: "put" | "delete" | "get", url: string, token: string) {
  return request(testApp())[method](url).set("Authorization", `Bearer ${token}`);
}

describe("template interactions", { concurrency: 1 }, () => {
  before(async () => {
    connection = createDatabaseConnection(databaseConfig, logger);
    tokenService = new TokenService(authConfig);
    interactionService = new TemplateInteractionService(connection.db);
    manifest = await readCatalogManifest(path.join(catalogRoot, "seed.json"));
    await verifyDatabaseConnection(connection.pool);
  });

  beforeEach(async () => {
    await connection.db.execute(sql`
      truncate table template_likes, template_bookmarks, catalog_state,
      template_version_localizations, template_scenes, template_versions, templates,
      scene_localizations, scenes, oauth_nonce_uses, auth_identities, refresh_sessions,
      user_preferences, users restart identity cascade
    `);
    await importCatalog(connection.db, manifest, { assetRoot });
  });

  after(async () => closeDatabaseConnection(connection.pool));

  it("requires an active member and hides unpublished templates", async () => {
    const missing = await request(testApp()).put("/api/v1/templates/dev-beach-breeze/like");
    assert.equal(missing.status, 401);
    assert.equal(missing.body.code, "INVALID_TOKEN");

    const guest = await createPrincipal("GUEST");
    const guestLike = await authorized(
      "put",
      "/api/v1/templates/dev-beach-breeze/like",
      guest.token,
    );
    assert.equal(guestLike.status, 403);
    assert.equal(guestLike.body.code, "AUTH_REQUIRED");

    const member = await createPrincipal();
    const unknown = await authorized("put", "/api/v1/templates/not-found/like", member.token);
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.code, "RESOURCE_NOT_FOUND");

    await connection.db
      .update(templates)
      .set({ status: "ARCHIVED" })
      .where(eq(templates.id, "dev-beach-breeze"));
    const archived = await authorized(
      "put",
      "/api/v1/templates/dev-beach-breeze/like",
      member.token,
    );
    assert.equal(archived.status, 404);
  });

  it("keeps duplicate like and unlike requests idempotent and exposes viewer state", async () => {
    const member = await createPrincipal();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const liked = await authorized(
        "put",
        "/api/v1/templates/dev-beach-breeze/like",
        member.token,
      );
      assert.equal(liked.status, 200, JSON.stringify(liked.body));
      assert.deepEqual(liked.body, {
        templateId: "dev-beach-breeze",
        liked: true,
        likeCount: 1,
      });
    }

    const anonymousCatalog = await request(testApp()).get("/api/v1/templates?limit=10");
    const memberCatalog = await authorized("get", "/api/v1/templates?limit=10", member.token);
    assert.equal(anonymousCatalog.headers["cache-control"], "public, max-age=60");
    assert.equal(memberCatalog.headers["cache-control"], "private, no-store");
    assert.match(memberCatalog.headers.vary, /Authorization/u);
    assert.equal(
      anonymousCatalog.body.items.find((item: { id: string }) => item.id === "dev-beach-breeze")
        .liked,
      false,
    );
    assert.equal(
      memberCatalog.body.items.find((item: { id: string }) => item.id === "dev-beach-breeze")
        .liked,
      true,
    );
    const likedCollection = await authorized(
      "get",
      "/api/v1/me/liked-templates?locale=ko-KR",
      member.token,
    );
    assert.equal(likedCollection.status, 200, JSON.stringify(likedCollection.body));
    assert.equal(likedCollection.body.items.length, 1);
    assert.equal(likedCollection.body.items[0].id, "dev-beach-breeze");
    assert.equal(likedCollection.body.items[0].liked, true);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const unliked = await authorized(
        "delete",
        "/api/v1/templates/dev-beach-breeze/like",
        member.token,
      );
      assert.equal(unliked.status, 200);
      assert.equal(unliked.body.likeCount, 0);
      assert.equal(unliked.body.liked, false);
    }
    const [relations] = await connection.db.select({ value: count() }).from(templateLikes);
    assert.equal(relations.value, 0);
  });

  it("serializes concurrent duplicate requests without count drift", async () => {
    const members = await Promise.all(Array.from({ length: 8 }, () => createPrincipal()));
    const likes = await Promise.all(
      members.flatMap((member) => [
        authorized("put", "/api/v1/templates/dev-beach-breeze/like", member.token),
        authorized("put", "/api/v1/templates/dev-beach-breeze/like", member.token),
      ]),
    );
    assert.ok(likes.every((response) => response.status === 200));

    let [storedTemplate] = await connection.db
      .select({ likeCount: templates.likeCount })
      .from(templates)
      .where(eq(templates.id, "dev-beach-breeze"));
    let [relations] = await connection.db.select({ value: count() }).from(templateLikes);
    assert.equal(storedTemplate.likeCount, 8);
    assert.equal(relations.value, 8);

    const removals = await Promise.all(
      members.slice(0, 4).flatMap((member) => [
        authorized("delete", "/api/v1/templates/dev-beach-breeze/like", member.token),
        authorized("delete", "/api/v1/templates/dev-beach-breeze/like", member.token),
      ]),
    );
    assert.ok(removals.every((response) => response.status === 200));
    [storedTemplate] = await connection.db
      .select({ likeCount: templates.likeCount })
      .from(templates)
      .where(eq(templates.id, "dev-beach-breeze"));
    [relations] = await connection.db.select({ value: count() }).from(templateLikes);
    assert.equal(storedTemplate.likeCount, 4);
    assert.equal(relations.value, 4);
  });

  it("keeps bookmarks idempotent and paginates collections with a bound stable cursor", async () => {
    const member = await createPrincipal();
    const other = await createPrincipal();
    const ids = manifest.templates.map((template) => template.id);
    for (const templateId of ids) {
      const first = await authorized(
        "put",
        `/api/v1/templates/${templateId}/bookmark`,
        member.token,
      );
      const duplicate = await authorized(
        "put",
        `/api/v1/templates/${templateId}/bookmark`,
        member.token,
      );
      assert.equal(first.status, 200);
      assert.deepEqual(duplicate.body, { templateId, bookmarked: true });
    }
    const detail = await authorized(
      "get",
      `/api/v1/templates/${ids[0]}?locale=ko-KR`,
      member.token,
    );
    assert.equal(detail.body.bookmarked, true);
    const sameTime = new Date("2026-09-21T00:00:00.000Z");
    await connection.db.update(templateBookmarks).set({ createdAt: sameTime });

    const firstPage = await authorized(
      "get",
      "/api/v1/me/bookmarked-templates?locale=ko-KR&limit=2",
      member.token,
    );
    assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
    assert.equal(firstPage.body.items.length, 2);
    assert.equal(firstPage.body.hasNext, true);
    assert.ok(firstPage.body.items.every((item: { bookmarked: boolean }) => item.bookmarked));

    const secondPage = await authorized(
      "get",
      `/api/v1/me/bookmarked-templates?locale=ko-KR&limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`,
      member.token,
    );
    assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
    assert.equal(secondPage.body.items.length, 2);
    assert.equal(
      new Set(
        [...firstPage.body.items, ...secondPage.body.items].map(
          (item: { id: string }) => item.id,
        ),
      ).size,
      4,
    );

    const wrongCollection = await authorized(
      "get",
      `/api/v1/me/liked-templates?cursor=${encodeURIComponent(firstPage.body.nextCursor)}`,
      member.token,
    );
    const wrongMember = await authorized(
      "get",
      `/api/v1/me/bookmarked-templates?cursor=${encodeURIComponent(firstPage.body.nextCursor)}`,
      other.token,
    );
    assert.equal(wrongCollection.body.code, "INVALID_CURSOR");
    assert.equal(wrongMember.body.code, "INVALID_CURSOR");

    const removed = await authorized(
      "delete",
      `/api/v1/templates/${ids[0]}/bookmark`,
      member.token,
    );
    const duplicateRemoval = await authorized(
      "delete",
      `/api/v1/templates/${ids[0]}/bookmark`,
      member.token,
    );
    assert.deepEqual(removed.body, { templateId: ids[0], bookmarked: false });
    assert.deepEqual(duplicateRemoval.body, removed.body);
  });

  it("rejects a revoked member session", async () => {
    const member = await createPrincipal();
    await connection.db
      .update(refreshSessions)
      .set({ revokedAt: new Date() })
      .where(eq(refreshSessions.id, member.sessionId));
    const response = await authorized(
      "put",
      "/api/v1/templates/dev-beach-breeze/like",
      member.token,
    );
    assert.equal(response.status, 401);
    assert.equal(response.body.code, "INVALID_TOKEN");
  });
});

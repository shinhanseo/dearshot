import assert from "node:assert/strict";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { count, eq, sql } from "drizzle-orm";
import pino from "pino";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { CatalogService } from "../../src/catalog/catalog-service.js";
import { importCatalog } from "../../src/catalog/import-catalog.js";
import { readCatalogManifest, type CatalogManifest } from "../../src/catalog/manifest.js";
import type { DatabaseConfig } from "../../src/config/environment.js";
import {
  closeDatabaseConnection,
  createDatabaseConnection,
  type DatabaseConnection,
  verifyDatabaseConnection,
} from "../../src/db/client.js";
import { catalogState, templateVersions, templates } from "../../src/db/schema/catalog.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required for database tests.");

const databaseConfig: DatabaseConfig = {
  connectionString: databaseUrl,
  maxConnections: 4,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
};
const logger = pino({ level: "silent" });
const catalogRoot = path.resolve("catalog");
const assetRoot = path.join(catalogRoot, "assets");
let connection: DatabaseConnection;
let manifest: CatalogManifest;

function testApp() {
  return createApp({
    logger,
    checkDatabase: () => verifyDatabaseConnection(connection.pool),
    catalog: {
      service: new CatalogService(connection.db, "http://localhost:3000/assets/catalog"),
      assetRoot,
    },
  });
}

describe("template catalog database flows", { concurrency: 1 }, () => {
  before(async () => {
    connection = createDatabaseConnection(databaseConfig, logger);
    manifest = await readCatalogManifest(path.join(catalogRoot, "seed.json"));
    await verifyDatabaseConnection(connection.pool);
  });

  beforeEach(async () => {
    await connection.db.execute(sql`
      truncate table catalog_state, template_version_localizations, template_scenes,
      template_versions, templates, scene_localizations, scenes restart identity cascade
    `);
  });

  after(async () => closeDatabaseConnection(connection.pool));

  it("imports the same catalog repeatedly without duplicating published content", async () => {
    await importCatalog(connection.db, manifest, { assetRoot });
    const stateBefore = await connection.db.query.catalogState.findFirst({
      where: eq(catalogState.id, "current"),
    });
    await importCatalog(connection.db, manifest, { assetRoot });

    const [templateCount] = await connection.db.select({ value: count() }).from(templates);
    const [versionCount] = await connection.db.select({ value: count() }).from(templateVersions);
    assert.equal(templateCount.value, 4);
    assert.equal(versionCount.value, 4);
    const stateAfter = await connection.db.query.catalogState.findFirst({
      where: eq(catalogState.id, "current"),
    });
    assert.equal(stateAfter?.importedAt.toISOString(), stateBefore?.importedAt.toISOString());
  });

  it("serves localized scenes, stable pagination, detail, and catalog assets", async () => {
    await importCatalog(connection.db, manifest, { assetRoot });
    const app = testApp();

    const scenes = await request(app).get("/api/v1/scenes?locale=ko-KR");
    assert.equal(scenes.status, 200, JSON.stringify(scenes.body));
    assert.equal(scenes.body.items[0].displayName, "바다 · 개발용 샘플");
    assert.equal(scenes.body.items[0].templateCount, 4);

    const fallback = await request(app).get("/api/v1/scenes?locale=fr-FR");
    assert.equal(fallback.body.items[0].displayName, "Beach · development sample");

    const firstPage = await request(app).get(
      "/api/v1/templates?scene=dev-beach&locale=ko-KR&limit=2",
    );
    assert.equal(firstPage.status, 200, JSON.stringify(firstPage.body));
    assert.equal(firstPage.body.items.length, 2);
    assert.equal(firstPage.body.hasNext, true);

    const secondPage = await request(app).get("/api/v1/templates").query({
      scene: "dev-beach",
      locale: "ko-KR",
      limit: 2,
      cursor: firstPage.body.nextCursor,
    });
    assert.equal(secondPage.status, 200, JSON.stringify(secondPage.body));
    assert.equal(secondPage.body.items.length, 2);
    assert.equal(secondPage.body.hasNext, false);
    assert.equal(
      new Set([...firstPage.body.items, ...secondPage.body.items].map((item) => item.id)).size,
      4,
    );

    const detail = await request(app).get("/api/v1/templates/dev-beach-breeze?locale=ko-KR");
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.version, 1);
    assert.equal(detail.body.guide.type, "SVG_OVERLAY");
    assert.equal(detail.body.instructions.length, 2);

    const asset = await request(app).get("/assets/catalog/scenes/dev-beach.svg");
    assert.equal(asset.status, 200);
    assert.match(asset.headers["content-type"], /image\/svg\+xml/u);
  });

  it("binds cursors to their filters and sort order", async () => {
    await importCatalog(connection.db, manifest, { assetRoot });
    const first = await request(testApp()).get("/api/v1/templates?limit=1&sort=recommended");
    const mismatch = await request(testApp()).get("/api/v1/templates").query({
      limit: 1,
      sort: "popular",
      cursor: first.body.nextCursor,
    });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.body.code, "INVALID_CURSOR");
  });

  it("rejects changes to an already published version at importer and database levels", async () => {
    await importCatalog(connection.db, manifest, { assetRoot });
    const modified = structuredClone(manifest);
    modified.templates[0].versions[0].localizations["en-US"].title = "Changed in place";
    await assert.rejects(
      importCatalog(connection.db, modified, { assetRoot }),
      /cannot be changed/u,
    );

    await assert.rejects(
      connection.db
        .update(templateVersions)
        .set({ previewPath: "changed.svg" })
        .where(eq(templateVersions.templateId, "dev-beach-breeze")),
    );
    const stored = await connection.db.query.templateVersions.findFirst({
      where: eq(templateVersions.templateId, "dev-beach-breeze"),
    });
    assert.equal(stored?.previewPath, manifest.templates[0].versions[0].previewPath);
  });

  it("validates every asset before opening the import transaction", async () => {
    const broken = structuredClone(manifest);
    broken.templates[0].versions[0].previewPath = "missing.svg";
    await assert.rejects(importCatalog(connection.db, broken, { assetRoot }), /missing or unsafe/u);
    const [templateCount] = await connection.db.select({ value: count() }).from(templates);
    assert.equal(templateCount.value, 0);
  });
});

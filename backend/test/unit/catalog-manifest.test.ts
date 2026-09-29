import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import {
  catalogManifestSchema,
  readCatalogManifest,
  validateCatalogAssets,
} from "../../src/catalog/manifest.js";

const catalogRoot = path.resolve("catalog");

describe("catalog manifest", () => {
  it("accepts the development fixture and verifies every referenced asset", async () => {
    const manifest = await readCatalogManifest(path.join(catalogRoot, "seed.json"));
    await validateCatalogAssets(manifest, path.join(catalogRoot, "assets"));
    assert.equal(manifest.templates.length, 4);
    assert.ok(manifest.templates.every((template) => template.id.startsWith("dev-")));
  });

  it("validates all curated scene assets and rejects an inverted target subject box", async () => {
    const sceneNames = ["waterfront", "cafe", "green-space", "urban-street"];
    for (const sceneName of sceneNames) {
      const manifest = await readCatalogManifest(path.join(catalogRoot, `${sceneName}-v1.json`));
      await validateCatalogAssets(manifest, path.join(catalogRoot, "assets"));
      assert.equal(manifest.templates.length, 6);
      assert.ok(manifest.templates.every((template) => template.versions[0].guide.config.targetSubjectBox));
    }

    const invalid = structuredClone(await readCatalogManifest(path.join(catalogRoot, "waterfront-v1.json")));
    invalid.templates[0].versions[0].guide.config.targetSubjectBox = {
      left: 0.8,
      top: 0.45,
      right: 0.56,
      bottom: 0.79,
    };
    assert.equal(catalogManifestSchema.safeParse(invalid).success, false);
  });

  it("rejects traversal paths and versions without the required fallback locale", () => {
    const invalid = {
      catalogVersion: "bad",
      scenes: [
        {
          key: "beach",
          active: true,
          thumbnailPath: "../secret.svg",
          sortOrder: 1,
          localizations: { "ko-KR": { displayName: "바다" } },
        },
      ],
      templates: [],
    };
    const result = catalogManifestSchema.safeParse(invalid);
    assert.equal(result.success, false);
    assert.match(JSON.stringify(result.error?.issues), /unsafe|en-US/u);
  });

  it("rejects a manifest that points at a missing file", async () => {
    const manifest = await readCatalogManifest(path.join(catalogRoot, "seed.json"));
    manifest.scenes[0].thumbnailPath = "scenes/does-not-exist.svg";
    await assert.rejects(
      validateCatalogAssets(manifest, path.join(catalogRoot, "assets")),
      /missing or unsafe/u,
    );
  });
});

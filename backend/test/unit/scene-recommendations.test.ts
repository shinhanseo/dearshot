import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MockSceneRecommendationProvider,
  SceneProviderError,
  validateSceneRecommendations,
  type RecommendationCandidate,
  type SceneRecommendation,
} from "../../src/scene-analysis/scene-recommendation-provider.js";

const candidates: RecommendationCandidate[] = ["waterfront", "waterfront", "waterfront", "cafe"]
  .map((sceneKey, index) => ({
    templateId: `template-${index}`, templateVersion: 2, sceneKeys: [sceneKey],
    peopleCount: 1, aspectRatios: ["9:16"], title: "Example", summary: "Example",
  }));
const choice = (index: number, confidence = 0.9): SceneRecommendation => ({
  sceneKey: candidates[index].sceneKeys[0], templateId: candidates[index].templateId,
  templateVersion: 2, confidence, reasonCode: "SCENE_MATCH",
});
const rejects = (items: SceneRecommendation[], code: string) => assert.throws(
  () => validateSceneRecommendations(items, candidates, 0.55),
  (error: unknown) => error instanceof SceneProviderError && error.code === code,
);

describe("ranked scene recommendations", () => {
  it("preserves provider rank for three distinct choices from one scene", () => {
    const items = [choice(2), choice(0), choice(1)];
    assert.deepEqual(validateSceneRecommendations(items, candidates, 0.55), items);
  });
  it("accepts one or two suitable choices without padding", () => {
    for (const count of [1, 2]) {
      const items = [choice(0), choice(1)].slice(0, count);
      assert.deepEqual(validateSceneRecommendations(items, candidates, 0.55), items);
    }
  });
  it("filters low-confidence alternatives but requires a confident primary", () => {
    assert.deepEqual(validateSceneRecommendations([choice(0), choice(1, 0.3)], candidates, 0.55), [choice(0)]);
    assert.deepEqual(validateSceneRecommendations([choice(0, 0.3), choice(1)], candidates, 0.55), []);
  });
  it("rejects duplicate template IDs and mixed scenes, even below the cutoff", () => {
    rejects([choice(0), choice(0)], "PROVIDER_INCONSISTENT_RECOMMENDATIONS");
    rejects([choice(0), choice(3, 0.1)], "PROVIDER_INCONSISTENT_RECOMMENDATIONS");
  });
  it("validates every ID, version and scene against the allowlist", () => {
    for (const override of [{ templateId: "invented" }, { templateVersion: 999 }, { sceneKey: "cafe" }]) {
      rejects([choice(0), { ...choice(1), ...override }], "PROVIDER_SELECTED_DISALLOWED_TEMPLATE");
    }
  });
  it("rejects empty or oversized lists and invalid confidence", () => {
    rejects([], "PROVIDER_INVALID_RESPONSE");
    rejects([choice(0), choice(1), choice(2), choice(3)], "PROVIDER_INVALID_RESPONSE");
    rejects([choice(0, Number.NaN)], "PROVIDER_INVALID_RESPONSE");
  });
  it("mock provider returns at most three choices sharing the primary scene", async () => {
    const result = await new MockSceneRecommendationProvider().recommend({
      image: Buffer.from("image"), contentType: "image/jpeg", locale: "ko-KR",
      capturedAt: new Date().toISOString(), timezone: null, location: null,
      deviceAnalysis: null, candidates,
    }, new AbortController().signal);
    assert.equal(result.recommendations.length, 3);
    assert.ok(result.recommendations.every((item) => item.sceneKey === "waterfront"));
  });
});

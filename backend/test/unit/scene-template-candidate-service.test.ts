import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapPlaces365Scenes } from "../../src/scene-analysis/scene-template-candidate-service.js";

describe("Places365 scene mapping", () => {
  it("normalizes known labels to catalog scene keys", () => {
    const mapped = mapPlaces365Scenes({
      sceneClassifier: {
        model: "resnet18-places365",
        modelVersion: "1",
        runtime: "onnxruntime-android",
        candidates: [
          { label: "Beach", confidence: 0.3 },
          { label: "restaurant/patio", confidence: 0.2 },
          { label: "forest/broadleaf", confidence: 0.2 },
          { label: "building facade", confidence: 0.2 },
          { label: "cafeteria", confidence: 0.1 },
        ],
      },
    });

    assert.deepEqual([...mapped], ["waterfront", "cafe", "green-space", "urban-street"]);
  });

  it("treats missing on-device hints as an empty preference set", () => {
    assert.equal(mapPlaces365Scenes(null).size, 0);
  });
});

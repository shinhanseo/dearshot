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
          { label: "Beach", confidence: 0.9 },
          { label: "restaurant/patio", confidence: 0.7 },
          { label: "unknown place", confidence: 0.6 },
        ],
      },
    });

    assert.deepEqual([...mapped], ["beach", "dev-beach", "cafe"]);
  });

  it("treats missing on-device hints as an empty preference set", () => {
    assert.equal(mapPlaces365Scenes(null).size, 0);
  });
});

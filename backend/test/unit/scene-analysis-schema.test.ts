import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSceneAnalysisSchema } from "../../src/scene-analysis/scene-analysis-schema.js";

const valid = {
  uploadId: "018f78c8-43f2-7e57-ae38-5b820a3d9289",
  sceneRevision: 3,
  capturedAt: "2026-09-27T05:30:00Z",
  locale: "ko-KR",
  deviceAnalysis: {
    sceneClassifier: {
      model: "places365-resnet18", modelVersion: "places365-standard", runtime: "onnxruntime-android",
      candidates: [{ label: "beach", confidence: 0.91 }],
    },
    objectDetector: {
      model: "yolox-nano", modelVersion: "coco-2017", runtime: "onnxruntime-android",
      objects: [{ label: "person", confidence: 0.96, box: { left: 0.3, top: 0.18, right: 0.62, bottom: 0.94 } }],
    },
  },
  context: { timezone: "Asia/Seoul" },
};

describe("scene analysis request schema", () => {
  it("accepts missing on-device hints and a bounded complete snapshot", () => {
    const withoutHints = { ...valid, deviceAnalysis: undefined };
    assert.equal(createSceneAnalysisSchema.safeParse(withoutHints).success, true);
    assert.equal(createSceneAnalysisSchema.safeParse(valid).success, true);
  });

  it("rejects bad confidence, boxes, counts, labels, and unknown fields", () => {
    const cases: unknown[] = [
      { ...valid, deviceAnalysis: { ...valid.deviceAnalysis, sceneClassifier: { ...valid.deviceAnalysis.sceneClassifier, candidates: [{ label: "beach", confidence: 1.1 }] } } },
      { ...valid, deviceAnalysis: { ...valid.deviceAnalysis, objectDetector: { ...valid.deviceAnalysis.objectDetector, objects: [{ label: "person", confidence: 0.9, box: { left: 0.8, top: 0.1, right: 0.2, bottom: 0.9 } }] } } },
      { ...valid, deviceAnalysis: { sceneClassifier: { ...valid.deviceAnalysis.sceneClassifier, candidates: Array.from({ length: 6 }, () => ({ label: "beach", confidence: 0.8 })) } } },
      { ...valid, deviceAnalysis: { objectDetector: { ...valid.deviceAnalysis.objectDetector, objects: Array.from({ length: 21 }, () => valid.deviceAnalysis.objectDetector.objects[0]) } } },
      { ...valid, deviceAnalysis: { sceneClassifier: { ...valid.deviceAnalysis.sceneClassifier, candidates: [{ label: "Beach View!", confidence: 0.8 }] } } },
      { ...valid, deviceAnalysis: { sceneClassifier: { ...valid.deviceAnalysis.sceneClassifier, candidates: [{ label: "b".repeat(65), confidence: 0.8 }] } } },
      { ...valid, unexpected: "field" },
    ];
    for (const value of cases) assert.equal(createSceneAnalysisSchema.safeParse(value).success, false);
  });
});

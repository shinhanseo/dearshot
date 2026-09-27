import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPhotoFeedbackSchema } from "../../src/photo-feedback/photo-feedback-schema.js";

const valid = {
  uploadId: "018f78c8-43f2-7e57-ae38-5b820a3d9289",
  locale: "ko-KR",
  template: { id: "dev-beach-breeze", version: 1 },
  capture: { aspectRatio: "9:16", orientation: "PORTRAIT", guideEnabled: true },
};

describe("photo feedback request schema", () => {
  it("accepts a first shot and an optional retake reference", () => {
    assert.equal(createPhotoFeedbackSchema.safeParse(valid).success, true);
    assert.equal(createPhotoFeedbackSchema.safeParse({
      ...valid,
      analysisId: "018f78c8-43f2-7e57-ae38-5b820a3d9290",
      previousFeedbackId: "018f78c8-43f2-7e57-ae38-5b820a3d9291",
    }).success, true);
  });

  it("rejects invalid locale, template identity, capture values, and unknown fields", () => {
    const cases = [
      { ...valid, locale: "한국어" },
      { ...valid, template: { id: "Beach Template", version: 1 } },
      { ...valid, template: { id: "dev-beach-breeze", version: 0 } },
      { ...valid, capture: { ...valid.capture, aspectRatio: "16:9" } },
      { ...valid, unexpected: true },
    ];
    for (const value of cases) assert.equal(createPhotoFeedbackSchema.safeParse(value).success, false);
  });
});

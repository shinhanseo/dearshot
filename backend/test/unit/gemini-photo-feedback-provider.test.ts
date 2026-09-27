import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GeminiPhotoFeedbackProvider } from "../../src/photo-feedback/gemini-photo-feedback-provider.js";
import { PhotoFeedbackProviderError } from "../../src/photo-feedback/photo-feedback-provider.js";

const input = {
  image: Buffer.from("private-photo"),
  contentType: "image/jpeg",
  locale: "ko-KR",
  capture: { aspectRatio: "9:16" as const, orientation: "PORTRAIT" as const, guideEnabled: true },
  template: {
    id: "dev-beach-breeze", version: 1, title: "바닷바람을 느끼는 순간",
    summary: "바다를 배경으로 자연스럽게 서요.",
    guideConfig: {
      coordinateSpace: "NORMALIZED" as const,
      referenceWidth: 660,
      referenceHeight: 880,
      safeArea: { left: 0.05, top: 0.08, right: 0.95, bottom: 0.9 },
    },
    instructions: [{ order: 1, text: "인물을 화면 왼쪽에 맞춰 주세요." }],
  },
  previous: null,
};

function createProvider(fetchImplementation: typeof fetch) {
  return new GeminiPhotoFeedbackProvider({
    apiKey: "secret-key", model: "gemini-3.5-flash", timeoutMillis: 5_000,
    maximumResponseBytes: 64_000,
  }, fetchImplementation);
}

describe("GeminiPhotoFeedbackProvider", () => {
  it("requests one enum action with minimal thinking and parses token usage", async () => {
    let init: RequestInit | undefined;
    const provider = createProvider(async (_url, requestInit) => {
      init = requestInit;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          category: "COMPOSITION", actionCode: "MOVE_SUBJECT_LEFT", strength: "SMALL",
          confidence: 0.86, improvedFromPrevious: null,
        }) }] } }],
        usageMetadata: { promptTokenCount: 210, candidatesTokenCount: 14, thoughtsTokenCount: 8 },
      }), { status: 200 });
    });

    const result = await provider.evaluate(input, new AbortController().signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "MINIMAL");
    assert.equal(body.generationConfig.candidateCount, 1);
    assert.deepEqual(body.generationConfig.responseSchema.properties.actionCode.enum.includes("KEEP_CURRENT"), true);
    assert.equal(body.contents[0].parts[0].inlineData.data, input.image.toString("base64"));
    assert.equal(result.decision.actionCode, "MOVE_SUBJECT_LEFT");
    assert.deepEqual(result.usage, { inputTokens: 210, outputTokens: 22 });
  });

  it("maps retryable failures and rejects free-form or malformed output", async () => {
    await assert.rejects(
      createProvider(async () => new Response("private upstream body", { status: 429 }))
        .evaluate(input, new AbortController().signal),
      (error: unknown) => error instanceof PhotoFeedbackProviderError &&
        error.code === "PROVIDER_RATE_LIMIT" && error.retryable,
    );
    await assert.rejects(
      createProvider(async () => new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"message":"move left"}' }] } }],
      }), { status: 200 })).evaluate(input, new AbortController().signal),
      (error: unknown) => error instanceof PhotoFeedbackProviderError &&
        error.code === "PROVIDER_INVALID_RESPONSE" && !error.retryable,
    );
  });
});

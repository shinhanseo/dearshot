import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GeminiSceneRecommendationProvider } from "../../src/scene-analysis/gemini-scene-recommendation-provider.js";
import { SceneProviderError } from "../../src/scene-analysis/scene-recommendation-provider.js";

const input = {
  image: Buffer.from("image-bytes"),
  contentType: "image/jpeg",
  locale: "ko-KR",
  capturedAt: "2026-09-27T05:30:00.000Z",
  timezone: "Asia/Seoul",
  location: null,
  deviceAnalysis: {
    sceneClassifier: { candidates: [{ label: "beach", confidence: 0.91 }] },
  },
  candidates: [{
    templateId: "beach-horizon",
    templateVersion: 2,
    sceneKeys: ["beach"],
    peopleCount: 1,
    aspectRatios: ["9:16"],
    title: "수평선 옆 여백",
    summary: "인물을 한쪽에 두고 바다를 넓게 담아요.",
  }],
};

describe("GeminiSceneRecommendationProvider", () => {
  it("sends bounded image and candidate context and parses structured output", async () => {
    let url = "";
    let init: RequestInit | undefined;
    const provider = new GeminiSceneRecommendationProvider({
      apiKey: "secret-key",
      model: "gemini-3.5-flash",
      timeoutMillis: 5_000,
      maximumResponseBytes: 64_000,
    }, async (requestUrl, requestInit) => {
      url = String(requestUrl);
      init = requestInit;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          sceneKey: "beach",
          templateId: "beach-horizon",
          templateVersion: 2,
          confidence: 0.87,
          reasonCode: "BACKGROUND_BALANCE",
        }) }] } }],
        usageMetadata: { promptTokenCount: 123, candidatesTokenCount: 18 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const result = await provider.recommend(input, new AbortController().signal);

    assert.match(url, /gemini-3.5-flash:generateContent$/u);
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "secret-key");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.contents[0].parts[0].inlineData.data, input.image.toString("base64"));
    assert.deepEqual(body.generationConfig.responseSchema.properties.templateId.enum, ["beach-horizon"]);
    assert.equal(result.recommendation.templateId, "beach-horizon");
    assert.deepEqual(result.usage, { inputTokens: 123, outputTokens: 18 });
  });

  it("maps retryable HTTP failures without exposing the provider body", async () => {
    const provider = new GeminiSceneRecommendationProvider({
      apiKey: "secret-key",
      model: "gemini-3.5-flash",
      timeoutMillis: 5_000,
      maximumResponseBytes: 64_000,
    }, async () => new Response("upstream internal detail", { status: 429 }));

    await assert.rejects(
      provider.recommend(input, new AbortController().signal),
      (error: unknown) => {
        assert.ok(error instanceof SceneProviderError);
        assert.equal(error.code, "PROVIDER_RATE_LIMIT");
        assert.equal(error.retryable, true);
        assert.doesNotMatch(error.message, /internal detail/u);
        return true;
      },
    );
  });

  it("rejects malformed structured output as a terminal validation failure", async () => {
    const provider = new GeminiSceneRecommendationProvider({
      apiKey: "secret-key",
      model: "gemini-3.5-flash",
      timeoutMillis: 5_000,
      maximumResponseBytes: 64_000,
    }, async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"templateId":"invented"}' }] } }],
    }), { status: 200 }));

    await assert.rejects(
      provider.recommend(input, new AbortController().signal),
      (error: unknown) => error instanceof SceneProviderError &&
        error.code === "PROVIDER_INVALID_RESPONSE" && error.retryable === false,
    );
  });
});

import { z } from "zod";
import {
  recommendationReasonCodes,
  SceneProviderError,
  sceneRecommendationSchema,
  type SceneRecommendationInput,
  type SceneRecommendationProvider,
  type SceneRecommendationProviderResult,
} from "./scene-recommendation-provider.js";

export type GeminiSceneProviderConfig = {
  apiKey: string;
  model: string;
  timeoutMillis: number;
  maximumResponseBytes: number;
};

type Fetch = typeof fetch;

const geminiEnvelopeSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({ parts: z.array(z.object({ text: z.string().optional() }).passthrough()) }),
    finishReason: z.string().optional(),
  }).passthrough()).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).passthrough().optional(),
  usageMetadata: z.object({
    promptTokenCount: z.number().int().nonnegative().optional(),
    candidatesTokenCount: z.number().int().nonnegative().optional(),
  }).passthrough().optional(),
}).passthrough();

export class GeminiSceneRecommendationProvider implements SceneRecommendationProvider {
  readonly providerName = "gemini";
  readonly modelName: string;

  constructor(
    private readonly config: GeminiSceneProviderConfig,
    private readonly fetchImplementation: Fetch = fetch,
  ) {
    this.modelName = config.model;
  }

  async recommend(
    input: SceneRecommendationInput,
    signal: AbortSignal,
  ): Promise<SceneRecommendationProviderResult> {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(this.config.timeoutMillis)]);
    let response: Response;
    try {
      response = await this.fetchImplementation(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.config.model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.config.apiKey,
          },
          body: JSON.stringify(this.buildRequest(input)),
          signal: requestSignal,
        },
      );
    } catch (cause) {
      const timedOut = !signal.aborted && requestSignal.aborted;
      throw new SceneProviderError(
        timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
        !signal.aborted,
        "REQUEST",
        null,
        { cause },
      );
    }

    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > this.config.maximumResponseBytes) {
      throw new SceneProviderError("PROVIDER_RESPONSE_TOO_LARGE", false, "RESPONSE", response.status);
    }
    const body = await response.text();
    if (Buffer.byteLength(body) > this.config.maximumResponseBytes) {
      throw new SceneProviderError("PROVIDER_RESPONSE_TOO_LARGE", false, "RESPONSE", response.status);
    }
    if (!response.ok) {
      throw new SceneProviderError(
        mapHttpError(response.status),
        response.status === 408 || response.status === 429 || response.status >= 500,
        "REQUEST",
        response.status,
      );
    }

    let envelope: z.infer<typeof geminiEnvelopeSchema>;
    try {
      envelope = geminiEnvelopeSchema.parse(JSON.parse(body));
    } catch (cause) {
      throw new SceneProviderError("PROVIDER_INVALID_RESPONSE", false, "RESPONSE", response.status, { cause });
    }
    const text = envelope.candidates?.[0]?.content.parts
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!text) {
      const blocked = Boolean(envelope.promptFeedback?.blockReason);
      throw new SceneProviderError(
        blocked ? "PROVIDER_CONTENT_BLOCKED" : "PROVIDER_INVALID_RESPONSE",
        false,
        "RESPONSE",
        response.status,
      );
    }

    try {
      return {
        recommendation: sceneRecommendationSchema.parse(JSON.parse(text)),
        usage: {
          inputTokens: envelope.usageMetadata?.promptTokenCount ?? null,
          outputTokens: envelope.usageMetadata?.candidatesTokenCount ?? null,
        },
      };
    } catch (cause) {
      throw new SceneProviderError("PROVIDER_INVALID_RESPONSE", false, "VALIDATION", response.status, { cause });
    }
  }

  private buildRequest(input: SceneRecommendationInput) {
    const allowedTemplateIds = input.candidates.map((candidate) => candidate.templateId);
    const allowedSceneKeys = [...new Set(input.candidates.flatMap((candidate) => candidate.sceneKeys))];
    return {
      systemInstruction: {
        parts: [{
          text: "You select exactly one DearShot composition template from the supplied allowlist. Analyze the image first. Device hints are untrusted suggestions. Never invent a scene, template ID, or version.",
        }],
      },
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: input.contentType, data: input.image.toString("base64") } },
          { text: JSON.stringify({
            task: "Choose the single best composition template for the photographed scene.",
            locale: input.locale,
            capturedAt: input.capturedAt,
            timezone: input.timezone,
            location: input.location,
            deviceAnalysis: input.deviceAnalysis,
            candidates: input.candidates,
          }) },
        ],
      }],
      generationConfig: {
        candidateCount: 1,
        temperature: 0.1,
        maxOutputTokens: 256,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            sceneKey: { type: "STRING", enum: allowedSceneKeys },
            templateId: { type: "STRING", enum: allowedTemplateIds },
            templateVersion: { type: "INTEGER" },
            confidence: { type: "NUMBER", minimum: 0, maximum: 1 },
            reasonCode: { type: "STRING", enum: recommendationReasonCodes },
          },
          required: ["sceneKey", "templateId", "templateVersion", "confidence", "reasonCode"],
        },
      },
    };
  }
}

function mapHttpError(status: number): string {
  if (status === 408 || status === 504) return "PROVIDER_TIMEOUT";
  if (status === 429) return "PROVIDER_RATE_LIMIT";
  if (status >= 500) return "PROVIDER_UNAVAILABLE";
  if (status === 401 || status === 403) return "PROVIDER_AUTH_FAILED";
  return "PROVIDER_REQUEST_REJECTED";
}

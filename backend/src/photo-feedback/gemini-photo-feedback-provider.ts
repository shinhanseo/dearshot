import { z } from "zod";
import { SceneProviderError } from "../scene-analysis/scene-recommendation-provider.js";
import {
  feedbackActionCodes,
  feedbackCategories,
  photoFeedbackDecisionSchema,
  type PhotoFeedbackProvider,
  type PhotoFeedbackProviderInput,
  type PhotoFeedbackProviderResult,
} from "./photo-feedback-provider.js";

export type GeminiPhotoFeedbackConfig = {
  apiKey: string;
  model: string;
  timeoutMillis: number;
  maximumResponseBytes: number;
};

const envelopeSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({ parts: z.array(z.object({ text: z.string().optional() }).passthrough()) }),
  }).passthrough()).optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).passthrough().optional(),
  usageMetadata: z.object({
    promptTokenCount: z.number().int().nonnegative().optional(),
    candidatesTokenCount: z.number().int().nonnegative().optional(),
    thoughtsTokenCount: z.number().int().nonnegative().optional(),
  }).passthrough().optional(),
}).passthrough();

export class GeminiPhotoFeedbackProvider implements PhotoFeedbackProvider {
  readonly providerName = "gemini";
  readonly modelName: string;

  constructor(
    private readonly config: GeminiPhotoFeedbackConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    this.modelName = config.model;
  }

  async evaluate(input: PhotoFeedbackProviderInput, signal: AbortSignal): Promise<PhotoFeedbackProviderResult> {
    const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(this.config.timeoutMillis)]);
    let response: Response;
    try {
      response = await this.fetchImplementation(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.config.model)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.config.apiKey },
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

    let envelope: z.infer<typeof envelopeSchema>;
    try {
      envelope = envelopeSchema.parse(JSON.parse(body));
    } catch (cause) {
      throw new SceneProviderError("PROVIDER_INVALID_RESPONSE", false, "RESPONSE", response.status, { cause });
    }
    const text = envelope.candidates?.[0]?.content.parts.map((part) => part.text ?? "").join("").trim();
    if (!text) {
      throw new SceneProviderError(
        envelope.promptFeedback?.blockReason ? "PROVIDER_CONTENT_BLOCKED" : "PROVIDER_INVALID_RESPONSE",
        false,
        "RESPONSE",
        response.status,
      );
    }
    try {
      return {
        decision: photoFeedbackDecisionSchema.parse(JSON.parse(text)),
        usage: {
          inputTokens: envelope.usageMetadata?.promptTokenCount ?? null,
          outputTokens: envelope.usageMetadata
            ? (envelope.usageMetadata.candidatesTokenCount ?? 0) + (envelope.usageMetadata.thoughtsTokenCount ?? 0)
            : null,
        },
      };
    } catch (cause) {
      throw new SceneProviderError("PROVIDER_INVALID_RESPONSE", false, "VALIDATION", response.status, { cause });
    }
  }

  private buildRequest(input: PhotoFeedbackProviderInput) {
    return {
      systemInstruction: { parts: [{
        text: "Evaluate one photographed result against the supplied DearShot template. Select exactly one highest-impact action from the enum. Device-side alignment feedback is handled elsewhere. Return KEEP_CURRENT when no meaningful retake is needed. Never write user-facing prose.",
      }] },
      contents: [{ role: "user", parts: [
        { inlineData: { mimeType: input.contentType, data: input.image.toString("base64") } },
        { text: JSON.stringify({
          task: "Choose one next-shot action and assess whether the previous action improved when previous exists.",
          locale: input.locale,
          capture: input.capture,
          template: input.template,
          previousFeedback: input.previous,
        }) },
      ] }],
      generationConfig: {
        candidateCount: 1,
        temperature: 0.1,
        maxOutputTokens: 192,
        thinkingConfig: { thinkingLevel: "MINIMAL" },
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            category: { type: "STRING", enum: feedbackCategories },
            actionCode: { type: "STRING", enum: feedbackActionCodes },
            strength: { type: "STRING", enum: ["SMALL", "MEDIUM"] },
            confidence: { type: "NUMBER", minimum: 0, maximum: 1 },
            improvedFromPrevious: { type: "BOOLEAN", nullable: true },
          },
          required: ["category", "actionCode", "strength", "confidence", "improvedFromPrevious"],
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

import { z } from "zod";

export const recommendationReasonCodes = [
  "SCENE_MATCH",
  "SUBJECT_PLACEMENT",
  "BACKGROUND_BALANCE",
  "LIGHTING_CONTEXT",
  "FALLBACK_BEST_FIT",
] as const;

export type RecommendationCandidate = {
  templateId: string;
  templateVersion: number;
  sceneKeys: string[];
  peopleCount: number;
  aspectRatios: string[];
  title: string;
  summary: string;
};

export type SceneRecommendationInput = {
  image: Buffer;
  contentType: string;
  locale: string;
  capturedAt: string;
  timezone: string | null;
  location: {
    latitude: number;
    longitude: number;
    accuracyMeters: number | null;
  } | null;
  deviceAnalysis: unknown;
  candidates: RecommendationCandidate[];
};

export type SceneRecommendation = {
  sceneKey: string;
  templateId: string;
  templateVersion: number;
  confidence: number;
  reasonCode: typeof recommendationReasonCodes[number];
};

export type ProviderUsage = { inputTokens: number | null; outputTokens: number | null };

export type SceneRecommendationProviderResult = {
  recommendation: SceneRecommendation;
  usage: ProviderUsage;
};

export interface SceneRecommendationProvider {
  readonly providerName: string;
  readonly modelName: string;
  recommend(input: SceneRecommendationInput, signal: AbortSignal): Promise<SceneRecommendationProviderResult>;
}

export class SceneProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly phase: "REQUEST" | "RESPONSE" | "VALIDATION",
    readonly providerStatusCode: number | null = null,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "SceneProviderError";
  }
}

export const sceneRecommendationSchema = z.object({
  sceneKey: z.string().min(1).max(64),
  templateId: z.string().min(1).max(80),
  templateVersion: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  reasonCode: z.enum(recommendationReasonCodes),
}).strict();

export class MockSceneRecommendationProvider implements SceneRecommendationProvider {
  readonly providerName = "mock";
  readonly modelName = "deterministic-b16";

  async recommend(
    input: SceneRecommendationInput,
    signal: AbortSignal,
  ): Promise<SceneRecommendationProviderResult> {
    signal.throwIfAborted();
    const candidate = input.candidates[0];
    if (!candidate) {
      throw new SceneProviderError("NO_TEMPLATE_CANDIDATES", false, "VALIDATION");
    }
    return {
      recommendation: {
        sceneKey: candidate.sceneKeys[0] ?? "unknown",
        templateId: candidate.templateId,
        templateVersion: candidate.templateVersion,
        confidence: 0.9,
        reasonCode: "SCENE_MATCH",
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

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
  recommendations: SceneRecommendation[];
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

export const sceneRecommendationsSchema = z.object({
  recommendations: z.array(sceneRecommendationSchema).min(1).max(3),
}).strict();

/** Validate every choice before applying the confidence cutoff. Never pad with arbitrary templates. */
export function validateSceneRecommendations(
  recommendations: SceneRecommendation[],
  candidates: RecommendationCandidate[],
  minimumConfidence: number,
): SceneRecommendation[] {
  const parsed = sceneRecommendationsSchema.safeParse({ recommendations });
  if (!parsed.success) {
    throw new SceneProviderError("PROVIDER_INVALID_RESPONSE", false, "VALIDATION");
  }
  const seen = new Set<string>();
  const sceneKey = recommendations[0].sceneKey;
  for (const item of recommendations) {
    const allowed = candidates.some((candidate) =>
      candidate.templateId === item.templateId &&
      candidate.templateVersion === item.templateVersion &&
      candidate.sceneKeys.includes(item.sceneKey)
    );
    if (!allowed) {
      throw new SceneProviderError("PROVIDER_SELECTED_DISALLOWED_TEMPLATE", false, "VALIDATION");
    }
    if (seen.has(item.templateId) || item.sceneKey !== sceneKey) {
      throw new SceneProviderError("PROVIDER_INCONSISTENT_RECOMMENDATIONS", false, "VALIDATION");
    }
    seen.add(item.templateId);
  }
  // The first item is the primary recommendation; do not silently promote alternatives.
  if (recommendations[0].confidence < minimumConfidence) return [];
  return recommendations.filter((item) => item.confidence >= minimumConfidence);
}

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
    const sceneKey = candidate.sceneKeys[0] ?? "unknown";
    return {
      recommendations: input.candidates
        .filter((item) => item.sceneKeys.includes(sceneKey))
        .filter((item, index, all) => all.findIndex((other) => other.templateId === item.templateId) === index)
        .slice(0, 3)
        .map((item) => ({
          sceneKey,
          templateId: item.templateId,
          templateVersion: item.templateVersion,
          confidence: 0.9,
          reasonCode: "SCENE_MATCH" as const,
        })),
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

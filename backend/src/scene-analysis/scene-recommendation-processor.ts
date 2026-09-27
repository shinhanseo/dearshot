import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { aiJobAttempts } from "../db/schema/jobs.js";
import type { ImageStorage } from "../uploads/image-storage.js";
import {
  SceneProcessingError,
  type ClaimedSceneAnalysis,
  type SceneAnalysisProcessor,
  type SceneProcessingContext,
  type SceneProcessingResult,
} from "./scene-analysis-processor.js";
import {
  SceneProviderError,
  type SceneRecommendationProvider,
} from "./scene-recommendation-provider.js";
import { SceneTemplateCandidateService } from "./scene-template-candidate-service.js";

const PROMPT_VERSION = "scene-recommendation-v1";
const SCHEMA_VERSION = "scene-recommendation-v1";

export type SceneRecommendationProcessorConfig = { minimumConfidence: number };

export class SceneRecommendationProcessor implements SceneAnalysisProcessor {
  constructor(
    private readonly database: Database,
    private readonly storage: Pick<ImageStorage, "read">,
    private readonly candidates: SceneTemplateCandidateService,
    private readonly provider: SceneRecommendationProvider,
    private readonly config: SceneRecommendationProcessorConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async process(
    analysis: ClaimedSceneAnalysis,
    context: SceneProcessingContext,
  ): Promise<SceneProcessingResult> {
    context.signal.throwIfAborted();
    const candidates = await this.candidates.find({
      locale: analysis.locale,
      imageWidth: analysis.imageWidth,
      imageHeight: analysis.imageHeight,
      deviceAnalysis: analysis.deviceAnalysis,
    });
    if (candidates.length === 0) {
      return {
        outcome: "NEEDS_USER_SELECTION",
        reasonCode: "NO_TEMPLATE_CANDIDATES",
        sceneCandidates: [],
        source: "catalog",
      };
    }

    let image: Buffer;
    try {
      image = await this.storage.read(analysis.storagePath);
    } catch (cause) {
      throw new SceneProcessingError("ANALYSIS_IMAGE_UNAVAILABLE", false, { cause });
    }

    context.signal.throwIfAborted();
    const requestId = randomUUID();
    const startedAt = this.clock();
    await this.database.insert(aiJobAttempts).values({
      sceneAnalysisId: analysis.analysisId,
      attemptNumber: analysis.attemptCount,
      requestId,
      provider: this.provider.providerName,
      model: this.provider.modelName,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      startedAt,
    });

    try {
      const result = await this.provider.recommend({
        image,
        contentType: analysis.contentType,
        locale: analysis.locale,
        capturedAt: analysis.capturedAt.toISOString(),
        timezone: analysis.timezone,
        location: analysis.latitude === null || analysis.longitude === null ? null : {
          latitude: analysis.latitude,
          longitude: analysis.longitude,
          accuracyMeters: analysis.locationAccuracyMeters,
        },
        deviceAnalysis: analysis.deviceAnalysis,
        candidates,
      }, context.signal);
      const selected = candidates.find((candidate) =>
        candidate.templateId === result.recommendation.templateId &&
        candidate.templateVersion === result.recommendation.templateVersion &&
        candidate.sceneKeys.includes(result.recommendation.sceneKey)
      );
      if (!selected) {
        throw new SceneProviderError("PROVIDER_SELECTED_DISALLOWED_TEMPLATE", false, "VALIDATION");
      }
      await this.finishAttempt(analysis, "SUCCEEDED", startedAt, {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
      if (result.recommendation.confidence < this.config.minimumConfidence) {
        return {
          outcome: "NEEDS_USER_SELECTION",
          reasonCode: "LOW_RECOMMENDATION_CONFIDENCE",
          sceneCandidates: [...new Set(candidates.flatMap((candidate) => candidate.sceneKeys))].slice(0, 5),
          source: this.provider.providerName,
        };
      }
      return {
        outcome: "RECOMMENDED",
        scene: {
          sceneKey: result.recommendation.sceneKey,
          confidence: result.recommendation.confidence,
        },
        recommendation: {
          template: {
            id: result.recommendation.templateId,
            version: result.recommendation.templateVersion,
          },
          reasonCode: result.recommendation.reasonCode,
        },
        source: this.provider.providerName,
      };
    } catch (error) {
      const providerError = error instanceof SceneProviderError
        ? error
        : new SceneProviderError("PROVIDER_UNAVAILABLE", true, "REQUEST", null, { cause: error });
      await this.finishAttempt(analysis, "FAILED", startedAt, {
        failurePhase: providerError.phase,
        errorCode: providerError.code,
        providerStatusCode: providerError.providerStatusCode,
        retryable: providerError.retryable,
      });
      throw new SceneProcessingError(providerError.code, providerError.retryable, { cause: providerError });
    }
  }

  private async finishAttempt(
    analysis: ClaimedSceneAnalysis,
    status: "SUCCEEDED" | "FAILED",
    startedAt: Date,
    values: {
      failurePhase?: string;
      errorCode?: string;
      providerStatusCode?: number | null;
      retryable?: boolean;
      inputTokens?: number | null;
      outputTokens?: number | null;
    },
  ): Promise<void> {
    const completedAt = this.clock();
    await this.database.update(aiJobAttempts).set({
      status,
      completedAt,
      latencyMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
      ...values,
    }).where(and(
      eq(aiJobAttempts.sceneAnalysisId, analysis.analysisId),
      eq(aiJobAttempts.attemptNumber, analysis.attemptCount),
    ));
  }
}

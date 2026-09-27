import type { DeviceAnalysisSnapshot } from "../db/schema/jobs.js";

export type ClaimedSceneAnalysis = {
  analysisId: string;
  ownerUserId: string;
  sceneRevision: number;
  uploadId: string;
  storagePath: string;
  contentType: string;
  imageWidth: number;
  imageHeight: number;
  locale: string;
  capturedAt: Date;
  deviceAnalysis: DeviceAnalysisSnapshot | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyMeters: number | null;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: Date;
  leaseToken: string;
};

export type SceneProcessingResult =
  | {
      outcome: "RECOMMENDED";
      scene: { sceneKey: string; confidence: number | null };
      recommendation: {
        template: { id: string; version: number };
        reasonCode: string;
      };
      source: string;
    }
  | {
      outcome: "NEEDS_USER_SELECTION";
      reasonCode: "NO_TEMPLATE_CANDIDATES" | "LOW_RECOMMENDATION_CONFIDENCE";
      sceneCandidates: string[];
      source: string;
    };

export type SceneProcessingContext = {
  signal: AbortSignal;
};

export interface SceneAnalysisProcessor {
  process(
    analysis: ClaimedSceneAnalysis,
    context: SceneProcessingContext,
  ): Promise<SceneProcessingResult>;
}

export class SceneProcessingError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "SceneProcessingError";
  }
}

export class FakeSceneAnalysisProcessor implements SceneAnalysisProcessor {
  async process(
    analysis: ClaimedSceneAnalysis,
    context: SceneProcessingContext,
  ): Promise<SceneProcessingResult> {
    context.signal.throwIfAborted();

    const firstCandidate = analysis.deviceAnalysis?.sceneClassifier?.candidates[0];
    return {
      outcome: "RECOMMENDED",
      scene: {
        sceneKey: firstCandidate?.label ?? "unknown",
        confidence: firstCandidate?.confidence ?? null,
      },
      recommendation: {
        template: { id: "b15-development-placeholder", version: 1 },
        reasonCode: "B15_FAKE_PROCESSOR",
      },
      source: "fake",
    };
  }
}

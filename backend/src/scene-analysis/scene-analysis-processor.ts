import type { DeviceAnalysisSnapshot } from "../db/schema/jobs.js";

export type SceneAnalysisStage =
  | "PREPARING_INPUT"
  | "FILTERING_TEMPLATES"
  | "REQUESTING_PROVIDER"
  | "FINALIZING";

export type ClaimedSceneAnalysis = {
  analysisId: string;
  sceneRevision: number;
  uploadId: string;
  storagePath: string;
  contentType: string;
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

export type SceneProcessingResult = {
  scene: { sceneKey: string; confidence: number | null };
  recommendation: {
    template: { id: string; version: number };
    reasonCode: string;
  };
  source: string;
};

export type SceneProcessingContext = {
  signal: AbortSignal;
  emitStage: (stage: SceneAnalysisStage) => Promise<void>;
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
    await context.emitStage("FILTERING_TEMPLATES");
    context.signal.throwIfAborted();
    await context.emitStage("REQUESTING_PROVIDER");
    context.signal.throwIfAborted();

    const firstCandidate = analysis.deviceAnalysis?.sceneClassifier?.candidates[0];
    return {
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

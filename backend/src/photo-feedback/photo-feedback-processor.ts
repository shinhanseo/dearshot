import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { templateVersionLocalizations, templateVersions } from "../db/schema/catalog.js";
import type { Database } from "../db/client.js";
import { aiJobAttempts, photoFeedbacks } from "../db/schema/jobs.js";
import { SceneProcessingError } from "../scene-analysis/scene-analysis-processor.js";
import { SceneProviderError } from "../scene-analysis/scene-recommendation-provider.js";
import type { ImageStorage } from "../uploads/image-storage.js";
import {
  actionCategory,
  actionMessageKeys,
  feedbackActionCodes,
  feedbackCategories,
  type PhotoFeedbackProvider,
} from "./photo-feedback-provider.js";

const PROMPT_VERSION = "photo-feedback-v1";
const SCHEMA_VERSION = "photo-feedback-v1";

export type ClaimedPhotoFeedback = {
  feedbackId: string;
  uploadId: string;
  storagePath: string;
  contentType: string;
  templateId: string;
  templateVersion: number;
  previousFeedbackId: string | null;
  retakeIndex: number;
  locale: string;
  capture: { aspectRatio: "4:3" | "9:16" | "1:1"; orientation: "PORTRAIT" | "LANDSCAPE"; guideEnabled: boolean };
  attemptCount: number;
  maxAttempts: number;
  expiresAt: Date;
  leaseToken: string;
};

export type PhotoFeedbackResult = {
  primary: {
    category: typeof feedbackCategories[number];
    actionCode: typeof feedbackActionCodes[number];
    strength: "SMALL" | "MEDIUM";
    messageKey: string;
    confidence: number;
  };
  comparison: { available: boolean; improvedFromPrevious: boolean | null };
  retakeRecommended: boolean;
  retakeIndex: number;
  source: string;
};

export interface PhotoFeedbackProcessor {
  process(feedback: ClaimedPhotoFeedback, signal: AbortSignal): Promise<PhotoFeedbackResult>;
}

export class ProviderPhotoFeedbackProcessor implements PhotoFeedbackProcessor {
  constructor(
    private readonly database: Database,
    private readonly storage: Pick<ImageStorage, "read">,
    private readonly provider: PhotoFeedbackProvider,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async process(feedback: ClaimedPhotoFeedback, signal: AbortSignal): Promise<PhotoFeedbackResult> {
    signal.throwIfAborted();
    const [version] = await this.database.select({
      guideConfig: templateVersions.guideConfig,
    }).from(templateVersions).where(and(
      eq(templateVersions.templateId, feedback.templateId),
      eq(templateVersions.version, feedback.templateVersion),
      eq(templateVersions.status, "PUBLISHED"),
    )).limit(1);
    if (!version) throw new SceneProcessingError("TEMPLATE_VERSION_UNAVAILABLE", false);
    const localizations = await this.database.select({
      locale: templateVersionLocalizations.locale,
      title: templateVersionLocalizations.title,
      summary: templateVersionLocalizations.summary,
      instructions: templateVersionLocalizations.instructions,
    }).from(templateVersionLocalizations).where(and(
      eq(templateVersionLocalizations.templateId, feedback.templateId),
      eq(templateVersionLocalizations.version, feedback.templateVersion),
      inArray(templateVersionLocalizations.locale, [...new Set([feedback.locale, "en-US"])]),
    ));
    const localization = localizations.find((item) => item.locale === feedback.locale)
      ?? localizations.find((item) => item.locale === "en-US");
    if (!localization) throw new SceneProcessingError("TEMPLATE_LOCALIZATION_UNAVAILABLE", false);

    let previous: { actionCode: string; category: string; retakeIndex: number } | null = null;
    if (feedback.previousFeedbackId) {
      const [row] = await this.database.select({
        result: photoFeedbacks.result,
        retakeIndex: photoFeedbacks.retakeIndex,
      }).from(photoFeedbacks).where(eq(photoFeedbacks.id, feedback.previousFeedbackId)).limit(1);
      const primary = row?.result?.primary;
      if (primary && typeof primary === "object") {
        const actionCode = (primary as Record<string, unknown>).actionCode;
        const category = (primary as Record<string, unknown>).category;
        if (typeof actionCode === "string" && typeof category === "string") {
          previous = { actionCode, category, retakeIndex: row.retakeIndex };
        }
      }
      if (!previous) {
        throw new SceneProcessingError("PREVIOUS_FEEDBACK_RESULT_UNAVAILABLE", false);
      }
    }

    let image: Buffer;
    try {
      image = await this.storage.read(feedback.storagePath);
    } catch (cause) {
      throw new SceneProcessingError("FEEDBACK_IMAGE_UNAVAILABLE", false, { cause });
    }

    const startedAt = this.clock();
    await this.database.insert(aiJobAttempts).values({
      photoFeedbackId: feedback.feedbackId,
      attemptNumber: feedback.attemptCount,
      requestId: randomUUID(),
      provider: this.provider.providerName,
      model: this.provider.modelName,
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
      startedAt,
    });
    try {
      const providerResult = await this.provider.evaluate({
        image,
        contentType: feedback.contentType,
        locale: feedback.locale,
        capture: feedback.capture,
        template: {
          id: feedback.templateId,
          version: feedback.templateVersion,
          title: localization.title,
          summary: localization.summary,
          guideConfig: version.guideConfig,
          instructions: localization.instructions,
        },
        previous,
      }, signal);
      const decision = providerResult.decision;
      if (actionCategory[decision.actionCode] !== decision.category) {
        throw new SceneProviderError("PROVIDER_SELECTED_INVALID_FEEDBACK_ACTION", false, "VALIDATION");
      }
      if (!previous && decision.improvedFromPrevious !== null) {
        throw new SceneProviderError("PROVIDER_INVALID_COMPARISON", false, "VALIDATION");
      }
      await this.finishAttempt(feedback, "SUCCEEDED", startedAt, {
        inputTokens: providerResult.usage.inputTokens,
        outputTokens: providerResult.usage.outputTokens,
      });
      return {
        primary: {
          category: decision.category,
          actionCode: decision.actionCode,
          strength: decision.strength,
          messageKey: actionMessageKeys[decision.actionCode],
          confidence: decision.confidence,
        },
        comparison: {
          available: Boolean(previous),
          improvedFromPrevious: previous ? decision.improvedFromPrevious : null,
        },
        retakeRecommended: decision.actionCode !== "KEEP_CURRENT",
        retakeIndex: feedback.retakeIndex,
        source: this.provider.providerName,
      };
    } catch (error) {
      const providerError = error instanceof SceneProviderError
        ? error
        : new SceneProviderError("PROVIDER_UNAVAILABLE", true, "REQUEST", null, { cause: error });
      await this.finishAttempt(feedback, "FAILED", startedAt, {
        failurePhase: providerError.phase,
        errorCode: providerError.code,
        providerStatusCode: providerError.providerStatusCode,
        retryable: providerError.retryable,
      });
      throw new SceneProcessingError(providerError.code, providerError.retryable, { cause: providerError });
    }
  }

  private async finishAttempt(
    feedback: ClaimedPhotoFeedback,
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
      eq(aiJobAttempts.photoFeedbackId, feedback.feedbackId),
      eq(aiJobAttempts.attemptNumber, feedback.attemptCount),
    ));
  }
}

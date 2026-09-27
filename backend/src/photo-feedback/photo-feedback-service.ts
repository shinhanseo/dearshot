import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { AccessPrincipal } from "../auth/token-service.js";
import { templates, templateVersions } from "../db/schema/catalog.js";
import type { Database } from "../db/client.js";
import { imageUploads, photoFeedbacks, sceneAnalyses } from "../db/schema/jobs.js";
import { ApiError } from "../http/api-error.js";
import { hashIdempotentRequest, type IdempotencyResult, IdempotencyService } from "../reliability/idempotency-service.js";
import { UsageLimitService } from "../reliability/usage-limit-service.js";
import type { UploadService } from "../uploads/upload-service.js";
import type { CreatePhotoFeedbackRequest } from "./photo-feedback-schema.js";

export type PhotoFeedbackServiceConfig = { retentionDays: number; maxAttempts: number; pollAfterMillis: number };
type CreateResponse = { feedbackId: string; status: "QUEUED"; pollAfterMs: number; expiresAt: string };

export class PhotoFeedbackService {
  constructor(
    private readonly database: Database,
    private readonly uploads: UploadService,
    private readonly idempotency: IdempotencyService,
    private readonly usageLimits: UsageLimitService,
    private readonly config: PhotoFeedbackServiceConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(
    principal: AccessPrincipal,
    input: CreatePhotoFeedbackRequest,
    idempotencyKey: string,
  ): Promise<IdempotencyResult<CreateResponse>> {
    const ownerUserId = await this.uploads.resolveActivePrincipal(principal);
    const requestHash = hashIdempotentRequest([
      input.uploadId,
      input.analysisId ?? null,
      input.previousFeedbackId ?? null,
      input.locale,
      input.template.id,
      input.template.version,
      JSON.stringify(input.capture),
    ]);
    return this.idempotency.execute({
      userId: ownerUserId,
      scope: "POST /api/v1/photo-feedbacks",
      key: idempotencyKey,
      requestHash,
    }, async (transaction) => {
      const now = this.clock();
      const [upload] = await transaction.select({
        ownerUserId: imageUploads.ownerUserId,
        purpose: imageUploads.purpose,
        status: imageUploads.status,
        expiresAt: imageUploads.expiresAt,
      }).from(imageUploads).where(eq(imageUploads.id, input.uploadId)).limit(1).for("update");
      if (!upload || upload.ownerUserId !== ownerUserId) this.notFound("Upload");
      if (upload.purpose !== "PHOTO_FEEDBACK") {
        throw new ApiError({ statusCode: 409, code: "UPLOAD_PURPOSE_MISMATCH", message: "Upload purpose does not allow photo feedback" });
      }
      if (upload.status === "DELETED" || upload.status === "EXPIRED" || upload.expiresAt <= now) {
        throw new ApiError({ statusCode: 409, code: "UPLOAD_EXPIRED", message: "Upload is no longer available" });
      }
      if (upload.status !== "READY") {
        throw new ApiError({ statusCode: 409, code: "UPLOAD_ALREADY_USED", message: "Upload has already been consumed" });
      }

      const [template] = await transaction.select({ id: templates.id })
        .from(templates)
        .innerJoin(templateVersions, and(
          eq(templateVersions.templateId, templates.id),
          eq(templateVersions.version, input.template.version),
          eq(templateVersions.status, "PUBLISHED"),
        ))
        .where(and(eq(templates.id, input.template.id), eq(templates.status, "PUBLISHED")))
        .limit(1);
      if (!template) this.notFound("Template version");

      if (input.analysisId) {
        const [analysis] = await transaction.select({
          ownerUserId: sceneAnalyses.ownerUserId,
          status: sceneAnalyses.status,
          result: sceneAnalyses.result,
        }).from(sceneAnalyses).where(eq(sceneAnalyses.id, input.analysisId)).limit(1);
        if (!analysis || analysis.ownerUserId !== ownerUserId) this.notFound("Scene analysis");
        if (!inArrayValue(analysis.status, ["COMPLETED", "NEEDS_USER_SELECTION"])) {
          throw new ApiError({ statusCode: 409, code: "ANALYSIS_NOT_READY", message: "Scene analysis is not ready" });
        }
        if (analysis.status === "COMPLETED") {
          const reference = extractTemplateReference(analysis.result);
          if (!reference || reference.id !== input.template.id || reference.version !== input.template.version) {
            throw new ApiError({ statusCode: 409, code: "TEMPLATE_ANALYSIS_MISMATCH", message: "Template does not match the scene analysis" });
          }
        }
      }

      let retakeIndex = 0;
      if (input.previousFeedbackId) {
        const [previous] = await transaction.select({
          ownerUserId: photoFeedbacks.ownerUserId,
          status: photoFeedbacks.status,
          templateId: photoFeedbacks.templateId,
          templateVersion: photoFeedbacks.templateVersion,
          retakeIndex: photoFeedbacks.retakeIndex,
        }).from(photoFeedbacks).where(eq(photoFeedbacks.id, input.previousFeedbackId)).limit(1);
        if (!previous || previous.ownerUserId !== ownerUserId) this.notFound("Previous feedback");
        if (previous.status !== "COMPLETED") {
          throw new ApiError({ statusCode: 409, code: "PREVIOUS_FEEDBACK_NOT_READY", message: "Previous feedback is not complete" });
        }
        if (previous.templateId !== input.template.id || previous.templateVersion !== input.template.version) {
          throw new ApiError({ statusCode: 409, code: "PREVIOUS_FEEDBACK_TEMPLATE_MISMATCH", message: "Previous feedback used another template" });
        }
        retakeIndex = previous.retakeIndex + 1;
        if (retakeIndex > 100) {
          throw new ApiError({ statusCode: 409, code: "RETAKE_LIMIT_EXCEEDED", message: "Retake chain is too long" });
        }
      }

      await this.usageLimits.consumeInTransaction(transaction, principal, "PHOTO_FEEDBACK");
      const feedbackId = randomUUID();
      const expiresAt = new Date(now.getTime() + this.config.retentionDays * 86_400_000);
      await transaction.insert(photoFeedbacks).values({
        id: feedbackId,
        ownerUserId,
        uploadId: input.uploadId,
        templateId: input.template.id,
        templateVersion: input.template.version,
        sceneAnalysisId: input.analysisId,
        previousFeedbackId: input.previousFeedbackId,
        retakeIndex,
        locale: input.locale,
        capture: input.capture,
        maxAttempts: this.config.maxAttempts,
        expiresAt,
      });
      await transaction.update(imageUploads).set({ status: "CONSUMED", consumedAt: now })
        .where(and(eq(imageUploads.id, input.uploadId), eq(imageUploads.status, "READY")));
      return {
        statusCode: 202,
        resourceId: feedbackId,
        body: {
          feedbackId,
          status: "QUEUED" as const,
          pollAfterMs: this.config.pollAfterMillis,
          expiresAt: expiresAt.toISOString(),
        },
      };
    });
  }

  async get(principal: AccessPrincipal, feedbackId: string) {
    const ownerUserId = await this.uploads.resolveActivePrincipal(principal);
    const [feedback] = await this.database.select({
      feedbackId: photoFeedbacks.id,
      status: photoFeedbacks.status,
      templateId: photoFeedbacks.templateId,
      templateVersion: photoFeedbacks.templateVersion,
      analysisId: photoFeedbacks.sceneAnalysisId,
      previousFeedbackId: photoFeedbacks.previousFeedbackId,
      retakeIndex: photoFeedbacks.retakeIndex,
      result: photoFeedbacks.result,
      failureCode: photoFeedbacks.failureCode,
      retryable: photoFeedbacks.retryable,
      createdAt: photoFeedbacks.createdAt,
      startedAt: photoFeedbacks.startedAt,
      completedAt: photoFeedbacks.completedAt,
      cancelledAt: photoFeedbacks.cancelledAt,
      expiresAt: photoFeedbacks.expiresAt,
    }).from(photoFeedbacks).where(and(
      eq(photoFeedbacks.id, feedbackId),
      eq(photoFeedbacks.ownerUserId, ownerUserId),
    )).limit(1);
    if (!feedback) this.notFound("Photo feedback");
    return {
      ...feedback,
      pollAfterMs: ["QUEUED", "PROCESSING"].includes(feedback.status) ? this.config.pollAfterMillis : null,
      createdAt: feedback.createdAt.toISOString(),
      startedAt: feedback.startedAt?.toISOString() ?? null,
      completedAt: feedback.completedAt?.toISOString() ?? null,
      cancelledAt: feedback.cancelledAt?.toISOString() ?? null,
      expiresAt: feedback.expiresAt.toISOString(),
    };
  }

  async cancel(principal: AccessPrincipal, feedbackId: string): Promise<void> {
    const ownerUserId = await this.uploads.resolveActivePrincipal(principal);
    const terminalUpload = await this.database.transaction(async (transaction) => {
      const [feedback] = await transaction.select({
        status: photoFeedbacks.status,
        uploadId: photoFeedbacks.uploadId,
        storagePath: imageUploads.storagePath,
      }).from(photoFeedbacks)
        .innerJoin(imageUploads, eq(imageUploads.id, photoFeedbacks.uploadId))
        .where(and(eq(photoFeedbacks.id, feedbackId), eq(photoFeedbacks.ownerUserId, ownerUserId)))
        .limit(1)
        .for("update");
      if (!feedback) this.notFound("Photo feedback");
      if (feedback.status !== "QUEUED" && feedback.status !== "PROCESSING") return undefined;
      const now = this.clock();
      const [cancelled] = await transaction.update(photoFeedbacks).set({
        status: "CANCELLED",
        cancelledAt: now,
        updatedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      }).where(and(
        eq(photoFeedbacks.id, feedbackId),
        eq(photoFeedbacks.ownerUserId, ownerUserId),
        inArray(photoFeedbacks.status, ["QUEUED", "PROCESSING"]),
      )).returning({ id: photoFeedbacks.id });
      return cancelled ? feedback : undefined;
    });
    if (terminalUpload) {
      await this.uploads.purgeConsumed(terminalUpload.uploadId, terminalUpload.storagePath);
    }
  }

  private notFound(resource: string): never {
    throw new ApiError({ statusCode: 404, code: "RESOURCE_NOT_FOUND", message: `${resource} was not found` });
  }
}

function extractTemplateReference(result: Record<string, unknown> | null): { id: string; version: number } | null {
  const recommendation = result?.recommendation;
  if (!recommendation || typeof recommendation !== "object") return null;
  const template = (recommendation as Record<string, unknown>).template;
  if (!template || typeof template !== "object") return null;
  const id = (template as Record<string, unknown>).id;
  const version = (template as Record<string, unknown>).version;
  return typeof id === "string" && typeof version === "number" ? { id, version } : null;
}

function inArrayValue<T>(value: T, allowed: readonly T[]): boolean {
  return allowed.includes(value);
}

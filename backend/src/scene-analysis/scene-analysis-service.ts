import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { AccessPrincipal } from "../auth/token-service.js";
import type { Database } from "../db/client.js";
import { imageUploads, sceneAnalyses } from "../db/schema/jobs.js";
import { ApiError } from "../http/api-error.js";
import { hashIdempotentRequest, type IdempotencyResult, IdempotencyService } from "../reliability/idempotency-service.js";
import { UsageLimitService } from "../reliability/usage-limit-service.js";
import type { UploadService } from "../uploads/upload-service.js";
import type { CreateSceneAnalysisRequest } from "./scene-analysis-schema.js";

export type SceneAnalysisServiceConfig = { retentionDays: number };
type CreateResponse = { analysisId: string; sceneRevision: number; status: "QUEUED"; expiresAt: string };

export class SceneAnalysisService {
  constructor(
    private readonly database: Database,
    private readonly uploads: UploadService,
    private readonly idempotency: IdempotencyService,
    private readonly usageLimits: UsageLimitService,
    private readonly config: SceneAnalysisServiceConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(principal: AccessPrincipal, input: CreateSceneAnalysisRequest, idempotencyKey: string): Promise<IdempotencyResult<CreateResponse>> {
    const ownerUserId = await this.uploads.resolveActivePrincipal(principal);
    const requestHash = hashIdempotentRequest([
      input.uploadId, input.sceneRevision, input.capturedAt, input.locale,
      JSON.stringify(input.deviceAnalysis ?? null), JSON.stringify(input.context ?? null),
    ]);
    return this.idempotency.execute({
      userId: ownerUserId, scope: "POST /api/v1/scene-analyses", key: idempotencyKey, requestHash,
    }, async (transaction) => {
      const now = this.clock();
      const [upload] = await transaction.select({
        ownerUserId: imageUploads.ownerUserId, purpose: imageUploads.purpose,
        status: imageUploads.status, expiresAt: imageUploads.expiresAt,
      }).from(imageUploads).where(eq(imageUploads.id, input.uploadId)).limit(1).for("update");
      if (!upload || upload.ownerUserId !== ownerUserId) throw new ApiError({ statusCode: 404, code: "RESOURCE_NOT_FOUND", message: "Upload was not found" });
      if (upload.purpose !== "SCENE_ANALYSIS") throw new ApiError({ statusCode: 409, code: "UPLOAD_PURPOSE_MISMATCH", message: "Upload purpose does not allow scene analysis" });
      if (upload.status === "DELETED" || upload.status === "EXPIRED" || upload.expiresAt <= now) throw new ApiError({ statusCode: 409, code: "UPLOAD_EXPIRED", message: "Upload is no longer available" });
      if (upload.status !== "READY") throw new ApiError({ statusCode: 409, code: "UPLOAD_ALREADY_USED", message: "Upload has already been consumed" });

      await this.usageLimits.consumeInTransaction(transaction, principal, "SCENE_ANALYSIS");
      const analysisId = randomUUID();
      const expiresAt = new Date(now.getTime() + this.config.retentionDays * 86_400_000);
      const location = input.context?.location;
      await transaction.insert(sceneAnalyses).values({
        id: analysisId, ownerUserId, uploadId: input.uploadId, sceneRevision: input.sceneRevision,
        capturedAt: new Date(input.capturedAt), locale: input.locale, deviceAnalysis: input.deviceAnalysis,
        timezone: input.context?.timezone, latitude: location?.latitude, longitude: location?.longitude,
        locationAccuracyMeters: location?.accuracyMeters, expiresAt,
      });
      await transaction.update(imageUploads).set({ status: "CONSUMED", consumedAt: now })
        .where(and(eq(imageUploads.id, input.uploadId), eq(imageUploads.status, "READY")));
      return { statusCode: 202, resourceId: analysisId, body: {
        analysisId, sceneRevision: input.sceneRevision, status: "QUEUED" as const, expiresAt: expiresAt.toISOString(),
      } };
    });
  }

  async get(principal: AccessPrincipal, analysisId: string) {
    const ownerUserId = await this.uploads.resolveActivePrincipal(principal);
    const [analysis] = await this.database.select({
      analysisId: sceneAnalyses.id, sceneRevision: sceneAnalyses.sceneRevision, status: sceneAnalyses.status,
      capturedAt: sceneAnalyses.capturedAt, createdAt: sceneAnalyses.createdAt, startedAt: sceneAnalyses.startedAt,
      completedAt: sceneAnalyses.completedAt, cancelledAt: sceneAnalyses.cancelledAt,
      expiresAt: sceneAnalyses.expiresAt, result: sceneAnalyses.result,
      failureCode: sceneAnalyses.failureCode, retryable: sceneAnalyses.retryable,
    }).from(sceneAnalyses).where(and(eq(sceneAnalyses.id, analysisId), eq(sceneAnalyses.ownerUserId, ownerUserId))).limit(1);
    if (!analysis) this.notFound();
    return { ...analysis, capturedAt: analysis.capturedAt.toISOString(), createdAt: analysis.createdAt.toISOString(),
      startedAt: analysis.startedAt?.toISOString() ?? null, completedAt: analysis.completedAt?.toISOString() ?? null,
      cancelledAt: analysis.cancelledAt?.toISOString() ?? null, expiresAt: analysis.expiresAt.toISOString() };
  }

  async cancel(principal: AccessPrincipal, analysisId: string): Promise<void> {
    const ownerUserId = await this.uploads.resolveActivePrincipal(principal);
    await this.database.transaction(async (transaction) => {
      const [analysis] = await transaction.select({ status: sceneAnalyses.status }).from(sceneAnalyses)
        .where(and(eq(sceneAnalyses.id, analysisId), eq(sceneAnalyses.ownerUserId, ownerUserId))).limit(1).for("update");
      if (!analysis) this.notFound();
      if (analysis.status !== "QUEUED" && analysis.status !== "PROCESSING") return;
      await transaction.update(sceneAnalyses).set({ status: "CANCELLED", cancelledAt: this.clock() }).where(and(
        eq(sceneAnalyses.id, analysisId), eq(sceneAnalyses.ownerUserId, ownerUserId),
        inArray(sceneAnalyses.status, ["QUEUED", "PROCESSING"]),
      ));
    });
  }

  async completeIfProcessing(analysisId: string, result: Record<string, unknown>): Promise<boolean> {
    const [completed] = await this.database.update(sceneAnalyses).set({
      status: "COMPLETED",
      result,
      completedAt: this.clock(),
      failureCode: null,
      retryable: null,
    }).where(and(eq(sceneAnalyses.id, analysisId), eq(sceneAnalyses.status, "PROCESSING")))
      .returning({ id: sceneAnalyses.id });
    return Boolean(completed);
  }

  private notFound(): never {
    throw new ApiError({ statusCode: 404, code: "RESOURCE_NOT_FOUND", message: "Scene analysis was not found" });
  }
}

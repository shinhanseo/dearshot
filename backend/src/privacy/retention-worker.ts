import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { Logger } from "pino";
import type { Database } from "../db/client.js";
import { appEvents, idempotencyRecords } from "../db/schema/analytics.js";
import {
  accountDeletionRequests,
  oauthNonceUses,
  refreshSessions,
} from "../db/schema/identity.js";
import { aiJobAttempts, imageUploads, photoFeedbacks, sceneAnalyses } from "../db/schema/jobs.js";
import type { ImageStorage } from "../uploads/image-storage.js";

export type RetentionConfig = {
  intervalMillis: number;
  uploadMaximumAgeSeconds: number;
  aiAttemptRetentionDays: number;
  temporaryFileGraceSeconds: number;
};

export class RetentionWorker {
  private stopping = false;
  private loopPromise: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private wake: (() => void) | undefined;

  constructor(
    private readonly database: Database,
    private readonly storage: Pick<ImageStorage, "quarantine" | "cleanupTemporaryFiles">,
    private readonly config: RetentionConfig,
    private readonly logger: Pick<Logger, "info" | "warn" | "error">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  start(): void {
    if (this.loopPromise) return;
    this.stopping = false;
    this.loopPromise = this.loop();
    this.logger.info("Privacy retention worker started");
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.wake?.();
    await this.loopPromise;
    this.loopPromise = undefined;
  }

  async runOnce() {
    const now = this.clock();
    let expiredUploads = 0;
    while (await this.expireOneUpload(now)) expiredUploads += 1;

    const jobResult = await this.database.transaction(async (transaction) => {
      await transaction.update(aiJobAttempts).set({
        status: "FAILED",
        completedAt: now,
        errorCode: "RETENTION_EXPIRED",
        retryable: false,
      }).where(and(
        eq(aiJobAttempts.status, "STARTED"),
        sql`(
          ${aiJobAttempts.sceneAnalysisId} in (select id from scene_analyses where expires_at <= ${now})
          or ${aiJobAttempts.photoFeedbackId} in (select id from photo_feedbacks where expires_at <= ${now})
        )`,
      ));
      // Break optional history links before deleting their expired targets.
      await transaction.execute(sql`
        update photo_feedbacks
        set previous_feedback_id = null
        where previous_feedback_id in (
          select id from photo_feedbacks where expires_at <= ${now}
        )
      `);
      const deletedFeedbacks = await transaction.delete(photoFeedbacks)
        .where(lte(photoFeedbacks.expiresAt, now)).returning({ id: photoFeedbacks.id });
      await transaction.execute(sql`
        update photo_feedbacks
        set scene_analysis_id = null
        where scene_analysis_id in (
          select id from scene_analyses where expires_at <= ${now}
        )
      `);
      const deletedAnalyses = await transaction.delete(sceneAnalyses)
        .where(lte(sceneAnalyses.expiresAt, now)).returning({ id: sceneAnalyses.id });
      return { deletedFeedbacks: deletedFeedbacks.length, deletedAnalyses: deletedAnalyses.length };
    });

    const [attempts, events, idempotency, nonces, sessions, deletions] = await Promise.all([
      this.database.delete(aiJobAttempts).where(lte(
        aiJobAttempts.startedAt,
        new Date(now.getTime() - this.config.aiAttemptRetentionDays * 86_400_000),
      )).returning({ id: aiJobAttempts.id }),
      this.database.delete(appEvents).where(lte(appEvents.expiresAt, now)).returning({ id: appEvents.id }),
      this.database.delete(idempotencyRecords).where(lte(idempotencyRecords.expiresAt, now)).returning({ id: idempotencyRecords.id }),
      this.database.delete(oauthNonceUses).where(lte(oauthNonceUses.tokenExpiresAt, now)).returning({ id: oauthNonceUses.nonceHash }),
      this.database.delete(refreshSessions).where(lte(refreshSessions.expiresAt, now)).returning({ id: refreshSessions.id }),
      this.database.delete(accountDeletionRequests).where(and(
        eq(accountDeletionRequests.status, "COMPLETED"),
        lte(accountDeletionRequests.expiresAt, now),
      )).returning({ id: accountDeletionRequests.id }),
    ]);

    const deletedUploadRows = await this.database.execute(sql`
      delete from image_uploads u
      where u.status in ('DELETED', 'EXPIRED')
        and not exists (select 1 from scene_analyses s where s.upload_id = u.id)
        and not exists (select 1 from photo_feedbacks f where f.upload_id = u.id)
    `);
    const temporaryFiles = await this.storage.cleanupTemporaryFiles(new Date(
      now.getTime() - this.config.temporaryFileGraceSeconds * 1_000,
    ));
    const summary = {
      expiredUploads,
      ...jobResult,
      deletedAttempts: attempts.length,
      deletedEvents: events.length,
      deletedIdempotency: idempotency.length,
      deletedNonces: nonces.length,
      deletedSessions: sessions.length,
      deletedDeletionStatuses: deletions.length,
      deletedUploadRows: deletedUploadRows.rowCount ?? 0,
      temporaryFiles,
    };
    if (Object.values(summary).some((value) => value > 0)) {
      this.logger.info(summary, "Privacy retention cleanup completed");
    }
    return summary;
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try {
        await this.runOnce();
      } catch (error) {
        this.logger.error({ err: error }, "Privacy retention cleanup failed");
      }
      if (this.stopping) break;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        this.timer = setTimeout(resolve, this.config.intervalMillis);
        this.timer.unref();
      });
      this.timer = undefined;
      this.wake = undefined;
    }
  }

  private async expireOneUpload(now: Date): Promise<boolean> {
    const cutoff = new Date(now.getTime() - this.config.uploadMaximumAgeSeconds * 1_000);
    const [upload] = await this.database.select({
      id: imageUploads.id,
      storagePath: imageUploads.storagePath,
    }).from(imageUploads).where(and(
      inArray(imageUploads.status, ["READY", "CONSUMED"]),
      or(
        lte(imageUploads.expiresAt, now),
        lte(imageUploads.createdAt, cutoff),
      ),
    )).orderBy(asc(imageUploads.createdAt)).limit(1);
    if (!upload) return false;

    const file = await this.storage.quarantine(upload.storagePath);
    try {
      await this.database.transaction(async (transaction) => {
        await transaction.update(sceneAnalyses).set({
          status: "FAILED",
          failureCode: "IMAGE_RETENTION_EXPIRED",
          retryable: false,
          completedAt: now,
          updatedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          deviceAnalysis: null,
          timezone: null,
          latitude: null,
          longitude: null,
          locationAccuracyMeters: null,
        }).where(and(
          eq(sceneAnalyses.uploadId, upload.id),
          inArray(sceneAnalyses.status, ["QUEUED", "PROCESSING"]),
        ));
        await transaction.update(photoFeedbacks).set({
          status: "FAILED",
          failureCode: "IMAGE_RETENTION_EXPIRED",
          retryable: false,
          completedAt: now,
          updatedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
        }).where(and(
          eq(photoFeedbacks.uploadId, upload.id),
          inArray(photoFeedbacks.status, ["QUEUED", "PROCESSING"]),
        ));
        await transaction.update(imageUploads).set({
          status: "EXPIRED",
          deletedAt: now,
        }).where(eq(imageUploads.id, upload.id));
      });
      await file.discard().catch((error) => {
        this.logger.warn(
          { err: error, uploadId: upload.id },
          "Expired upload remains quarantined for a later cleanup",
        );
      });
    } catch (error) {
      await file.restore();
      throw error;
    }
    return true;
  }
}

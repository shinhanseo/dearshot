import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { Logger } from "pino";
import type { Database } from "../db/client.js";
import { imageUploads, photoFeedbacks } from "../db/schema/jobs.js";
import { SceneProcessingError } from "../scene-analysis/scene-analysis-processor.js";
import type { ClaimedPhotoFeedback, PhotoFeedbackProcessor, PhotoFeedbackResult } from "./photo-feedback-processor.js";

export type PhotoFeedbackWorkerConfig = {
  pollIntervalMillis: number;
  leaseSeconds: number;
  retryBaseSeconds: number;
  onTerminal?: (upload: { uploadId: string; storagePath: string }) => Promise<void>;
};

export class PhotoFeedbackWorker {
  private stopping = false;
  private loopPromise: Promise<void> | undefined;
  private wakeTimer: NodeJS.Timeout | undefined;
  private wakeResolver: (() => void) | undefined;

  constructor(
    private readonly database: Database,
    private readonly processor: PhotoFeedbackProcessor,
    private readonly config: PhotoFeedbackWorkerConfig,
    private readonly logger: Pick<Logger, "info" | "warn" | "error">,
    private readonly workerId: string = randomUUID(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  start(): void {
    if (this.loopPromise) return;
    this.stopping = false;
    this.loopPromise = this.loop();
    this.logger.info({ workerId: this.workerId }, "Photo feedback worker started");
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeResolver?.();
    await this.loopPromise;
    this.loopPromise = undefined;
    this.logger.info({ workerId: this.workerId }, "Photo feedback worker stopped");
  }

  async runOnce(): Promise<boolean> {
    if (await this.failOneTerminal(and(
      inArray(photoFeedbacks.status, ["QUEUED", "PROCESSING"]),
      lte(photoFeedbacks.expiresAt, this.clock()),
    ), "FEEDBACK_EXPIRED")) return true;
    const now = this.clock();
    if (await this.failOneTerminal(and(
      or(
        eq(photoFeedbacks.status, "QUEUED"),
        and(eq(photoFeedbacks.status, "PROCESSING"), lte(photoFeedbacks.leaseExpiresAt, now)),
      ),
      gte(photoFeedbacks.attemptCount, photoFeedbacks.maxAttempts),
    ), "FEEDBACK_RETRY_EXHAUSTED")) return true;
    const feedback = await this.claimNext();
    if (!feedback) return false;
    await this.process(feedback);
    return true;
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try {
        if (await this.runOnce()) continue;
      } catch (error) {
        this.logger.error({ err: error, workerId: this.workerId }, "Photo feedback worker iteration failed");
      }
      await this.waitForNextPoll();
    }
  }

  private waitForNextPoll(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.wakeResolver = resolve;
      this.wakeTimer = setTimeout(resolve, this.config.pollIntervalMillis);
      this.wakeTimer.unref();
    }).finally(() => {
      this.wakeTimer = undefined;
      this.wakeResolver = undefined;
    });
  }

  private async claimNext(): Promise<ClaimedPhotoFeedback | undefined> {
    const now = this.clock();
    const leaseToken = `${this.workerId}:${randomUUID()}`;
    const leaseExpiresAt = new Date(now.getTime() + this.config.leaseSeconds * 1_000);
    return this.database.transaction(async (transaction) => {
      const [candidate] = await transaction.select({ id: photoFeedbacks.id }).from(photoFeedbacks)
        .where(and(
          gt(photoFeedbacks.expiresAt, now),
          lt(photoFeedbacks.attemptCount, photoFeedbacks.maxAttempts),
          or(
            and(eq(photoFeedbacks.status, "QUEUED"), lte(photoFeedbacks.nextAttemptAt, now)),
            and(eq(photoFeedbacks.status, "PROCESSING"), lte(photoFeedbacks.leaseExpiresAt, now)),
          ),
        ))
        .orderBy(asc(photoFeedbacks.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!candidate) return undefined;
      const [claimed] = await transaction.update(photoFeedbacks).set({
        status: "PROCESSING",
        leaseOwner: leaseToken,
        leaseExpiresAt,
        attemptCount: sql`${photoFeedbacks.attemptCount} + 1`,
        startedAt: sql`coalesce(${photoFeedbacks.startedAt}, ${now})`,
        updatedAt: now,
        failureCode: null,
        retryable: null,
      }).where(eq(photoFeedbacks.id, candidate.id)).returning({
        feedbackId: photoFeedbacks.id,
        ownerUserId: photoFeedbacks.ownerUserId,
        uploadId: photoFeedbacks.uploadId,
        templateId: photoFeedbacks.templateId,
        templateVersion: photoFeedbacks.templateVersion,
        previousFeedbackId: photoFeedbacks.previousFeedbackId,
        retakeIndex: photoFeedbacks.retakeIndex,
        locale: photoFeedbacks.locale,
        capture: photoFeedbacks.capture,
        attemptCount: photoFeedbacks.attemptCount,
        maxAttempts: photoFeedbacks.maxAttempts,
        expiresAt: photoFeedbacks.expiresAt,
      });
      const [upload] = await transaction.select({
        storagePath: imageUploads.storagePath,
        contentType: imageUploads.contentType,
      }).from(imageUploads).where(eq(imageUploads.id, claimed.uploadId)).limit(1);
      if (!upload) throw new Error("Claimed photo feedback upload is missing");
      return { ...claimed, ...upload, leaseToken };
    });
  }

  private async process(feedback: ClaimedPhotoFeedback): Promise<void> {
    const abortController = new AbortController();
    const heartbeatMillis = Math.max(1_000, Math.floor(this.config.leaseSeconds * 1_000 / 3));
    const heartbeat = setInterval(() => {
      void this.renewLease(feedback).then((renewed) => {
        if (!renewed) abortController.abort(new Error("Photo feedback lease was lost"));
      }).catch((error) => this.logger.warn({ err: error, feedbackId: feedback.feedbackId }, "Feedback lease renewal failed"));
    }, heartbeatMillis);
    heartbeat.unref();
    try {
      const result = await this.processor.process(feedback, abortController.signal);
      const completed = await this.complete(feedback, result);
      if (completed) await this.cleanup(feedback);
    } catch (error) {
      if (await this.ownsLease(feedback)) {
        const terminal = await this.handleFailure(feedback, error);
        if (terminal) await this.cleanup(feedback);
      }
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async complete(feedback: ClaimedPhotoFeedback, result: PhotoFeedbackResult): Promise<boolean> {
    const now = this.clock();
    const [completed] = await this.database.update(photoFeedbacks).set({
      status: "COMPLETED",
      result,
      completedAt: now,
      updatedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      failureCode: null,
      retryable: null,
    }).where(and(
      eq(photoFeedbacks.id, feedback.feedbackId),
      eq(photoFeedbacks.status, "PROCESSING"),
      eq(photoFeedbacks.leaseOwner, feedback.leaseToken),
    )).returning({ id: photoFeedbacks.id });
    return Boolean(completed);
  }

  private async renewLease(feedback: ClaimedPhotoFeedback): Promise<boolean> {
    const now = this.clock();
    const [renewed] = await this.database.update(photoFeedbacks).set({
      leaseExpiresAt: new Date(now.getTime() + this.config.leaseSeconds * 1_000),
      updatedAt: now,
    }).where(and(
      eq(photoFeedbacks.id, feedback.feedbackId),
      eq(photoFeedbacks.status, "PROCESSING"),
      eq(photoFeedbacks.leaseOwner, feedback.leaseToken),
    )).returning({ id: photoFeedbacks.id });
    return Boolean(renewed);
  }

  private async ownsLease(feedback: ClaimedPhotoFeedback): Promise<boolean> {
    const [owned] = await this.database.select({ id: photoFeedbacks.id }).from(photoFeedbacks).where(and(
      eq(photoFeedbacks.id, feedback.feedbackId),
      eq(photoFeedbacks.status, "PROCESSING"),
      eq(photoFeedbacks.leaseOwner, feedback.leaseToken),
    )).limit(1);
    return Boolean(owned);
  }

  private async handleFailure(feedback: ClaimedPhotoFeedback, error: unknown): Promise<boolean> {
    const failure = error instanceof SceneProcessingError
      ? error
      : new SceneProcessingError("PHOTO_FEEDBACK_PROCESSING_FAILED", true, { cause: error });
    const now = this.clock();
    const shouldRetry = failure.retryable && feedback.attemptCount < feedback.maxAttempts;
    const [updated] = await this.database.update(photoFeedbacks).set(shouldRetry ? {
      status: "QUEUED",
      nextAttemptAt: new Date(now.getTime() + this.retryDelaySeconds(feedback.attemptCount) * 1_000),
      updatedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      failureCode: failure.code,
      retryable: true,
    } : {
      status: "FAILED",
      completedAt: now,
      updatedAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      failureCode: failure.code,
      retryable: failure.retryable,
    }).where(and(
      eq(photoFeedbacks.id, feedback.feedbackId),
      eq(photoFeedbacks.status, "PROCESSING"),
      eq(photoFeedbacks.leaseOwner, feedback.leaseToken),
    )).returning({ id: photoFeedbacks.id });
    return Boolean(updated) && !shouldRetry;
  }

  private retryDelaySeconds(attemptCount: number): number {
    return Math.min(300, this.config.retryBaseSeconds * 2 ** Math.max(0, attemptCount - 1));
  }

  private async failOneTerminal(condition: ReturnType<typeof and>, code: string): Promise<boolean> {
    const now = this.clock();
    const terminal = await this.database.transaction(async (transaction) => {
      const [candidate] = await transaction.select({
        id: photoFeedbacks.id,
        uploadId: photoFeedbacks.uploadId,
        storagePath: imageUploads.storagePath,
      }).from(photoFeedbacks)
        .innerJoin(imageUploads, eq(imageUploads.id, photoFeedbacks.uploadId))
        .where(condition)
        .orderBy(asc(photoFeedbacks.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!candidate) return undefined;
      await transaction.update(photoFeedbacks).set({
        status: "FAILED",
        failureCode: code,
        retryable: false,
        completedAt: now,
        updatedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      }).where(eq(photoFeedbacks.id, candidate.id));
      return candidate;
    });
    if (!terminal) return false;
    await this.cleanup(terminal);
    return true;
  }

  private async cleanup(upload: { uploadId: string; storagePath: string }): Promise<void> {
    if (!this.config.onTerminal) return;
    try {
      await this.config.onTerminal(upload);
    } catch (error) {
      this.logger.warn({ err: error, uploadId: upload.uploadId }, "Terminal feedback image cleanup failed");
    }
  }
}

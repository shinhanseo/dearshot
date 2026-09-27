import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { Logger } from "pino";
import type { Database } from "../db/client.js";
import {
  imageUploads,
  sceneAnalyses,
} from "../db/schema/jobs.js";
import {
  type ClaimedSceneAnalysis,
  type SceneAnalysisProcessor,
  SceneProcessingError,
  type SceneProcessingResult,
} from "./scene-analysis-processor.js";

export type SceneAnalysisWorkerConfig = {
  pollIntervalMillis: number;
  leaseSeconds: number;
  retryBaseSeconds: number;
  onTerminal?: (upload: { uploadId: string; storagePath: string }) => Promise<void>;
};

export class SceneAnalysisWorker {
  private stopping = false;
  private loopPromise: Promise<void> | undefined;
  private wakeTimer: NodeJS.Timeout | undefined;
  private wakeResolver: (() => void) | undefined;

  constructor(
    private readonly database: Database,
    private readonly processor: SceneAnalysisProcessor,
    private readonly config: SceneAnalysisWorkerConfig,
    private readonly logger: Pick<Logger, "info" | "warn" | "error">,
    private readonly workerId: string = randomUUID(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  start(): void {
    if (this.loopPromise) return;
    this.stopping = false;
    this.loopPromise = this.loop();
    this.logger.info({ workerId: this.workerId }, "Scene analysis worker started");
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeResolver?.();
    await this.loopPromise;
    this.loopPromise = undefined;
    this.logger.info({ workerId: this.workerId }, "Scene analysis worker stopped");
  }

  async runOnce(): Promise<boolean> {
    if (await this.failOneExpired()) return true;
    if (await this.failOneExhausted()) return true;
    const analysis = await this.claimNext();
    if (!analysis) return false;
    await this.process(analysis);
    return true;
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try {
        if (await this.runOnce()) continue;
      } catch (error) {
        this.logger.error({ err: error, workerId: this.workerId }, "Scene analysis worker iteration failed");
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

  private async claimNext(): Promise<ClaimedSceneAnalysis | undefined> {
    const now = this.clock();
    const leaseToken = `${this.workerId}:${randomUUID()}`;
    const leaseExpiresAt = new Date(now.getTime() + this.config.leaseSeconds * 1_000);

    return this.database.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select({ id: sceneAnalyses.id })
        .from(sceneAnalyses)
        .where(
          and(
            gt(sceneAnalyses.expiresAt, now),
            lt(sceneAnalyses.attemptCount, sceneAnalyses.maxAttempts),
            or(
              and(
                eq(sceneAnalyses.status, "QUEUED"),
                lte(sceneAnalyses.nextAttemptAt, now),
              ),
              and(
                eq(sceneAnalyses.status, "PROCESSING"),
                lte(sceneAnalyses.leaseExpiresAt, now),
              ),
            ),
          ),
        )
        .orderBy(asc(sceneAnalyses.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!candidate) return undefined;

      const [claimed] = await transaction
        .update(sceneAnalyses)
        .set({
          status: "PROCESSING",
          leaseOwner: leaseToken,
          leaseExpiresAt,
          attemptCount: sql`${sceneAnalyses.attemptCount} + 1`,
          startedAt: sql`coalesce(${sceneAnalyses.startedAt}, ${now})`,
          updatedAt: now,
          failureCode: null,
          retryable: null,
        })
        .where(eq(sceneAnalyses.id, candidate.id))
        .returning({
          analysisId: sceneAnalyses.id,
          ownerUserId: sceneAnalyses.ownerUserId,
          sceneRevision: sceneAnalyses.sceneRevision,
          uploadId: sceneAnalyses.uploadId,
          locale: sceneAnalyses.locale,
          capturedAt: sceneAnalyses.capturedAt,
          deviceAnalysis: sceneAnalyses.deviceAnalysis,
          timezone: sceneAnalyses.timezone,
          latitude: sceneAnalyses.latitude,
          longitude: sceneAnalyses.longitude,
          locationAccuracyMeters: sceneAnalyses.locationAccuracyMeters,
          attemptCount: sceneAnalyses.attemptCount,
          maxAttempts: sceneAnalyses.maxAttempts,
          expiresAt: sceneAnalyses.expiresAt,
        });
      const [upload] = await transaction
        .select({
          storagePath: imageUploads.storagePath,
          contentType: imageUploads.contentType,
          imageWidth: imageUploads.width,
          imageHeight: imageUploads.height,
        })
        .from(imageUploads)
        .where(eq(imageUploads.id, claimed.uploadId))
        .limit(1);
      if (!upload) throw new Error("Claimed scene analysis upload is missing");

      return { ...claimed, ...upload, leaseToken };
    });
  }

  private async process(analysis: ClaimedSceneAnalysis): Promise<void> {
    const abortController = new AbortController();
    const heartbeatMillis = Math.max(1_000, Math.floor(this.config.leaseSeconds * 1_000 / 3));
    const leaseHeartbeat = setInterval(() => {
      void this.renewLease(analysis).then((renewed) => {
        if (!renewed) abortController.abort(new Error("Scene analysis lease was lost"));
      }).catch((error) => {
        this.logger.warn({ err: error, analysisId: analysis.analysisId }, "Scene lease renewal failed");
      });
    }, heartbeatMillis);
    leaseHeartbeat.unref();

    try {
      const result = await this.processor.process(analysis, {
        signal: abortController.signal,
      });
      const completed = await this.complete(analysis, result);
      if (completed) await this.cleanupTerminalUpload(analysis);
    } catch (error) {
      if (await this.ownsLease(analysis)) {
        const terminal = await this.handleFailure(analysis, error);
        if (terminal) await this.cleanupTerminalUpload(analysis);
      }
    } finally {
      clearInterval(leaseHeartbeat);
    }
  }

  private async renewLease(analysis: ClaimedSceneAnalysis): Promise<boolean> {
    const now = this.clock();
    const [renewed] = await this.database
      .update(sceneAnalyses)
      .set({
        leaseExpiresAt: new Date(now.getTime() + this.config.leaseSeconds * 1_000),
        updatedAt: now,
      })
      .where(and(
        eq(sceneAnalyses.id, analysis.analysisId),
        eq(sceneAnalyses.status, "PROCESSING"),
        eq(sceneAnalyses.leaseOwner, analysis.leaseToken),
      ))
      .returning({ id: sceneAnalyses.id });
    return Boolean(renewed);
  }

  private async ownsLease(analysis: ClaimedSceneAnalysis): Promise<boolean> {
    const [owned] = await this.database
      .select({ id: sceneAnalyses.id })
      .from(sceneAnalyses)
      .where(and(
        eq(sceneAnalyses.id, analysis.analysisId),
        eq(sceneAnalyses.status, "PROCESSING"),
        eq(sceneAnalyses.leaseOwner, analysis.leaseToken),
      ))
      .limit(1);
    return Boolean(owned);
  }

  private async complete(
    analysis: ClaimedSceneAnalysis,
    result: SceneProcessingResult,
  ): Promise<boolean> {
    const now = this.clock();
    const [completed] = await this.database
      .update(sceneAnalyses)
      .set({
        status: result.outcome === "RECOMMENDED" ? "COMPLETED" : "NEEDS_USER_SELECTION",
        result,
        completedAt: now,
        updatedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        failureCode: null,
        retryable: null,
        deviceAnalysis: null,
        timezone: null,
        latitude: null,
        longitude: null,
        locationAccuracyMeters: null,
      })
      .where(and(
        eq(sceneAnalyses.id, analysis.analysisId),
        eq(sceneAnalyses.status, "PROCESSING"),
        eq(sceneAnalyses.leaseOwner, analysis.leaseToken),
      ))
      .returning({ id: sceneAnalyses.id });
    return Boolean(completed);
  }

  private async handleFailure(analysis: ClaimedSceneAnalysis, error: unknown): Promise<boolean> {
    const failure = error instanceof SceneProcessingError
      ? error
      : new SceneProcessingError("SCENE_PROCESSING_FAILED", true, { cause: error });
    const now = this.clock();
    const shouldRetry = failure.retryable && analysis.attemptCount < analysis.maxAttempts;
    const [updated] = await this.database
        .update(sceneAnalyses)
        .set(shouldRetry ? {
          status: "QUEUED",
          nextAttemptAt: new Date(
            now.getTime() + this.retryDelaySeconds(analysis.attemptCount) * 1_000,
          ),
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
          deviceAnalysis: null,
          timezone: null,
          latitude: null,
          longitude: null,
          locationAccuracyMeters: null,
        })
        .where(and(
          eq(sceneAnalyses.id, analysis.analysisId),
          eq(sceneAnalyses.status, "PROCESSING"),
          eq(sceneAnalyses.leaseOwner, analysis.leaseToken),
        ))
        .returning({ id: sceneAnalyses.id, nextAttemptAt: sceneAnalyses.nextAttemptAt });
    return Boolean(updated) && !shouldRetry;
  }

  private retryDelaySeconds(attemptCount: number): number {
    return Math.min(300, this.config.retryBaseSeconds * 2 ** Math.max(0, attemptCount - 1));
  }

  private async failOneExpired(): Promise<boolean> {
    return this.failOneTerminal(
      and(
        inArray(sceneAnalyses.status, ["QUEUED", "PROCESSING"]),
        lte(sceneAnalyses.expiresAt, this.clock()),
      ),
      "ANALYSIS_EXPIRED",
    );
  }

  private async failOneExhausted(): Promise<boolean> {
    const now = this.clock();
    return this.failOneTerminal(
      and(
        or(
          eq(sceneAnalyses.status, "QUEUED"),
          and(eq(sceneAnalyses.status, "PROCESSING"), lte(sceneAnalyses.leaseExpiresAt, now)),
        ),
        gte(sceneAnalyses.attemptCount, sceneAnalyses.maxAttempts),
      ),
      "SCENE_RETRY_EXHAUSTED",
    );
  }

  private async failOneTerminal(condition: ReturnType<typeof and>, code: string): Promise<boolean> {
    const now = this.clock();
    const terminal = await this.database.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select({
          id: sceneAnalyses.id,
          uploadId: sceneAnalyses.uploadId,
          storagePath: imageUploads.storagePath,
        })
        .from(sceneAnalyses)
        .innerJoin(imageUploads, eq(imageUploads.id, sceneAnalyses.uploadId))
        .where(condition)
        .orderBy(asc(sceneAnalyses.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!candidate) return undefined;
      await transaction.update(sceneAnalyses).set({
        status: "FAILED",
        failureCode: code,
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
      }).where(eq(sceneAnalyses.id, candidate.id));
      return candidate;
    });
    if (!terminal) return false;
    await this.cleanupTerminalUpload(terminal);
    return true;
  }

  private async cleanupTerminalUpload(upload: { uploadId: string; storagePath: string }): Promise<void> {
    if (!this.config.onTerminal) return;
    try {
      await this.config.onTerminal(upload);
    } catch (error) {
      this.logger.warn({ err: error, uploadId: upload.uploadId }, "Terminal scene image cleanup failed");
    }
  }

}

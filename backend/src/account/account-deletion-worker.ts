import { randomUUID } from "node:crypto";
import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import type { Logger } from "pino";
import type { Database } from "../db/client.js";
import { accountDeletionRequests, users } from "../db/schema/identity.js";
import { aiJobAttempts, imageUploads } from "../db/schema/jobs.js";
import type { ImageStorage } from "../uploads/image-storage.js";

type ClaimedDeletion = { id: string; userId: string; attemptCount: number; leaseOwner: string };

export class AccountDeletionWorker {
  private stopping = false;
  private loopPromise: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private wake: (() => void) | undefined;

  constructor(
    private readonly database: Database,
    private readonly storage: Pick<ImageStorage, "quarantine">,
    private readonly config: { pollIntervalMillis: number; leaseSeconds: number; retryBaseSeconds: number },
    private readonly logger: Pick<Logger, "info" | "warn" | "error">,
    private readonly workerId: string = randomUUID(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  start(): void {
    if (this.loopPromise) return;
    this.stopping = false;
    this.loopPromise = this.loop();
    this.logger.info({ workerId: this.workerId }, "Account deletion worker started");
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.wake?.();
    await this.loopPromise;
    this.loopPromise = undefined;
  }

  async runOnce(): Promise<boolean> {
    const claimed = await this.claim();
    if (!claimed) return false;
    await this.erase(claimed);
    return true;
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      try {
        if (await this.runOnce()) continue;
      } catch (error) {
        this.logger.error({ err: error }, "Account deletion iteration failed");
      }
      if (this.stopping) break;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        this.timer = setTimeout(resolve, this.config.pollIntervalMillis);
        this.timer.unref();
      });
      this.timer = undefined;
      this.wake = undefined;
    }
  }

  private async claim(): Promise<ClaimedDeletion | undefined> {
    const now = this.clock();
    const leaseOwner = `${this.workerId}:${randomUUID()}`;
    return this.database.transaction(async (transaction) => {
      const [candidate] = await transaction.select({ id: accountDeletionRequests.id })
        .from(accountDeletionRequests)
        .where(or(
          and(
            eq(accountDeletionRequests.status, "PENDING"),
            lte(accountDeletionRequests.nextAttemptAt, now),
          ),
          and(
            eq(accountDeletionRequests.status, "PROCESSING"),
            lte(accountDeletionRequests.leaseExpiresAt, now),
          ),
        ))
        .orderBy(asc(accountDeletionRequests.requestedAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!candidate) return undefined;
      const [claimed] = await transaction.update(accountDeletionRequests).set({
        status: "PROCESSING",
        attemptCount: sql`${accountDeletionRequests.attemptCount} + 1`,
        leaseOwner,
        leaseExpiresAt: new Date(now.getTime() + this.config.leaseSeconds * 1_000),
        lastErrorCode: null,
      }).where(eq(accountDeletionRequests.id, candidate.id)).returning({
        id: accountDeletionRequests.id,
        userId: accountDeletionRequests.userId,
        attemptCount: accountDeletionRequests.attemptCount,
      });
      return { ...claimed, leaseOwner };
    });
  }

  private async erase(request: ClaimedDeletion): Promise<void> {
    const uploads = await this.database.select({ storagePath: imageUploads.storagePath })
      .from(imageUploads).where(eq(imageUploads.ownerUserId, request.userId));
    const quarantined: Array<Awaited<ReturnType<ImageStorage["quarantine"]>>> = [];
    try {
      for (const upload of uploads) quarantined.push(await this.storage.quarantine(upload.storagePath));
      const now = this.clock();
      await this.database.transaction(async (transaction) => {
        const [owned] = await transaction.select({ id: accountDeletionRequests.id })
          .from(accountDeletionRequests).where(and(
            eq(accountDeletionRequests.id, request.id),
            eq(accountDeletionRequests.status, "PROCESSING"),
            eq(accountDeletionRequests.leaseOwner, request.leaseOwner),
          )).limit(1).for("update");
        if (!owned) throw new Error("Account deletion lease was lost");

        // Jobs and uploads use restrictive FKs so deletion order is explicit.
        await transaction.delete(aiJobAttempts).where(eq(aiJobAttempts.ownerUserId, request.userId));
        await transaction.execute(sql`delete from photo_feedbacks where owner_user_id = ${request.userId}`);
        await transaction.execute(sql`delete from scene_analyses where owner_user_id = ${request.userId}`);
        await transaction.delete(imageUploads).where(eq(imageUploads.ownerUserId, request.userId));
        await transaction.delete(users).where(eq(users.id, request.userId));
        await transaction.update(accountDeletionRequests).set({
          status: "COMPLETED",
          completedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
        }).where(eq(accountDeletionRequests.id, request.id));
      });
      const discarded = await Promise.allSettled(quarantined.map((file) => file.discard()));
      const discardFailures = discarded.filter((result) => result.status === "rejected");
      if (discardFailures.length > 0) {
        this.logger.warn(
          { deletionId: request.id, failures: discardFailures.length },
          "Account files remain quarantined for retention cleanup",
        );
      }
      this.logger.info({ deletionId: request.id, attempts: request.attemptCount }, "Account deletion completed");
    } catch (error) {
      await Promise.allSettled(quarantined.map((file) => file.restore()));
      const now = this.clock();
      const delaySeconds = Math.min(3_600, this.config.retryBaseSeconds * 2 ** Math.min(10, request.attemptCount - 1));
      await this.database.update(accountDeletionRequests).set({
        status: "PENDING",
        nextAttemptAt: new Date(now.getTime() + delaySeconds * 1_000),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: "ACCOUNT_DELETION_FAILED",
      }).where(and(
        eq(accountDeletionRequests.id, request.id),
        eq(accountDeletionRequests.leaseOwner, request.leaseOwner),
      ));
      this.logger.warn({ err: error, deletionId: request.id, attempts: request.attemptCount }, "Account deletion will retry");
    }
  }
}

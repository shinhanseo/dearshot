import { createHash } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { idempotencyRecords } from "../db/schema/analytics.js";
import { ApiError } from "../http/api-error.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type IdempotentResponse<T> = {
  statusCode: number;
  body: T;
  resourceId?: string;
};

export type IdempotencyResult<T> = IdempotentResponse<T> & { replayed: boolean };

export function hashIdempotentRequest(parts: readonly (string | number | boolean | null)[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export class IdempotencyService {
  constructor(
    private readonly database: Database,
    private readonly ttlSeconds = 86_400,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async execute<T>(
    options: { userId: string; scope: string; key: string; requestHash: string },
    handler: (transaction: Transaction) => Promise<IdempotentResponse<T>>,
  ): Promise<IdempotencyResult<T>> {
    const now = this.clock();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1_000);

    return this.database.transaction(async (transaction) => {
      await transaction
        .delete(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.userId, options.userId),
            eq(idempotencyRecords.scope, options.scope),
            eq(idempotencyRecords.idempotencyKey, options.key),
            lte(idempotencyRecords.expiresAt, now),
          ),
        );

      const [reserved] = await transaction
        .insert(idempotencyRecords)
        .values({
          userId: options.userId,
          scope: options.scope,
          idempotencyKey: options.key,
          requestHash: options.requestHash,
          expiresAt,
        })
        .onConflictDoNothing()
        .returning({ id: idempotencyRecords.id });

      if (!reserved) {
        const [existing] = await transaction
          .select()
          .from(idempotencyRecords)
          .where(
            and(
              eq(idempotencyRecords.userId, options.userId),
              eq(idempotencyRecords.scope, options.scope),
              eq(idempotencyRecords.idempotencyKey, options.key),
            ),
          )
          .limit(1)
          .for("update");

        if (!existing || existing.requestHash !== options.requestHash) {
          throw new ApiError({
            statusCode: 409,
            code: "IDEMPOTENCY_CONFLICT",
            message: "Idempotency key was already used for a different request",
          });
        }
        if (existing.status !== "COMPLETED" || existing.responseStatus === null) {
          throw new ApiError({
            statusCode: 409,
            code: "IDEMPOTENCY_IN_PROGRESS",
            message: "The original request is still being processed",
            retryAfterSeconds: 1,
          });
        }
        return {
          statusCode: existing.responseStatus,
          body: existing.responseBody as T,
          ...(existing.resourceId ? { resourceId: existing.resourceId } : {}),
          replayed: true,
        };
      }

      const completed = await handler(transaction);
      await transaction
        .update(idempotencyRecords)
        .set({
          status: "COMPLETED",
          responseStatus: completed.statusCode,
          responseBody: completed.body,
          resourceId: completed.resourceId,
          completedAt: now,
        })
        .where(eq(idempotencyRecords.id, reserved.id));

      return { ...completed, replayed: false };
    });
  }
}

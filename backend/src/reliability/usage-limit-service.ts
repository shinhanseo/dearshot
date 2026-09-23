import { and, eq, sql } from "drizzle-orm";
import type { AccessPrincipal } from "../auth/token-service.js";
import type { Database } from "../db/client.js";
import { dailyUsage } from "../db/schema/analytics.js";
import { ApiError } from "../http/api-error.js";

export type UsageKind = "SCENE_ANALYSIS" | "PHOTO_FEEDBACK";

export type UsageLimitConfig = {
  timezone: "UTC";
  guest: { sceneAnalysesPerDay: number; photoFeedbacksPerDay: number };
  member: { sceneAnalysesPerDay: number; photoFeedbacksPerDay: number };
};

export type UsageResult = {
  used: number;
  limit: number;
  remaining: number;
  usageDate: string;
  resetsAt: Date;
};

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function utcWindow(now: Date): { usageDate: string; resetsAt: Date } {
  const usageDate = now.toISOString().slice(0, 10);
  const resetsAt = new Date(`${usageDate}T00:00:00.000Z`);
  resetsAt.setUTCDate(resetsAt.getUTCDate() + 1);
  return { usageDate, resetsAt };
}

export class UsageLimitService {
  constructor(
    private readonly database: Database,
    private readonly config: UsageLimitConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async consume(principal: Pick<AccessPrincipal, "sub" | "principalType">, kind: UsageKind) {
    return this.database.transaction((transaction) => this.consumeInTransaction(transaction, principal, kind));
  }

  async consumeInTransaction(
    transaction: Transaction,
    principal: Pick<AccessPrincipal, "sub" | "principalType">,
    kind: UsageKind,
  ): Promise<UsageResult> {
    const now = this.clock();
    const { usageDate, resetsAt } = utcWindow(now);
    const limits = principal.principalType === "GUEST" ? this.config.guest : this.config.member;
    const limit =
      kind === "SCENE_ANALYSIS" ? limits.sceneAnalysesPerDay : limits.photoFeedbacksPerDay;

    const values = {
      userId: principal.sub,
      usageDate,
      sceneAnalysisCount: kind === "SCENE_ANALYSIS" ? 1 : 0,
      photoFeedbackCount: kind === "PHOTO_FEEDBACK" ? 1 : 0,
      updatedAt: now,
    };
    const counter =
      kind === "SCENE_ANALYSIS" ? dailyUsage.sceneAnalysisCount : dailyUsage.photoFeedbackCount;

    const [updated] = await transaction
      .insert(dailyUsage)
      .values(values)
      .onConflictDoUpdate({
        target: [dailyUsage.userId, dailyUsage.usageDate],
        set: {
          ...(kind === "SCENE_ANALYSIS"
            ? { sceneAnalysisCount: sql`${dailyUsage.sceneAnalysisCount} + 1` }
            : { photoFeedbackCount: sql`${dailyUsage.photoFeedbackCount} + 1` }),
          updatedAt: now,
        },
        setWhere: sql`${counter} < ${limit}`,
      })
      .returning({ used: counter });

    if (!updated) {
      const [current] = await transaction
        .select({ used: counter })
        .from(dailyUsage)
        .where(and(eq(dailyUsage.userId, principal.sub), eq(dailyUsage.usageDate, usageDate)))
        .limit(1);
      const retryAfterSeconds = Math.max(1, Math.ceil((resetsAt.getTime() - now.getTime()) / 1_000));
      throw new ApiError({
        statusCode: 429,
        code: "RATE_LIMITED",
        message: "Daily AI usage limit exceeded",
        details: { kind, used: current?.used ?? limit, limit, resetsAt: resetsAt.toISOString() },
        retryAfterSeconds,
      });
    }

    return {
      used: updated.used,
      limit,
      remaining: Math.max(0, limit - updated.used),
      usageDate,
      resetsAt,
    };
  }
}

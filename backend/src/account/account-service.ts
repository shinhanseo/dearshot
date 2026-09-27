import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  accountDeletionRequests,
  refreshSessions,
  userPreferences,
  users,
} from "../db/schema/identity.js";
import { photoFeedbacks, sceneAnalyses } from "../db/schema/jobs.js";
import { ApiError } from "../http/api-error.js";
import type { AccessPrincipal } from "../auth/token-service.js";

export type PreferencePatch = {
  locale?: string;
  defaultAspectRatio?: "4:3" | "9:16" | "1:1";
  allowLocationContext?: boolean;
  aiProcessingConsentVersion?: string | null;
};

export class AccountService {
  constructor(
    private readonly database: Database,
    private readonly deletionStatusRetentionDays: number,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async updatePreferences(principal: AccessPrincipal, patch: PreferencePatch) {
    const userId = await this.requireActiveMember(principal);
    const now = this.clock();
    const [updated] = await this.database.update(userPreferences).set({
      ...patch,
      updatedAt: now,
    }).where(eq(userPreferences.userId, userId)).returning({
      locale: userPreferences.locale,
      defaultAspectRatio: userPreferences.defaultAspectRatio,
      allowLocationContext: userPreferences.allowLocationContext,
      aiProcessingConsentVersion: userPreferences.aiProcessingConsentVersion,
    });
    return {
      ...updated,
      aiProcessingConsentVersion: updated.aiProcessingConsentVersion ?? "unconfirmed",
    };
  }

  async requestDeletion(principal: AccessPrincipal) {
    const [pending] = await this.database.select({
      id: accountDeletionRequests.id,
      status: accountDeletionRequests.status,
      requestedAt: accountDeletionRequests.requestedAt,
      completedAt: accountDeletionRequests.completedAt,
    }).from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.userId, principal.sub))
      .limit(1);
    if (pending) return this.deletionResponse(pending);

    const userId = await this.requireActiveMember(principal);
    const now = this.clock();
    const expiresAt = new Date(
      now.getTime() + this.deletionStatusRetentionDays * 86_400_000,
    );
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`,
      );
      const [existing] = await transaction.select({
        id: accountDeletionRequests.id,
        status: accountDeletionRequests.status,
        requestedAt: accountDeletionRequests.requestedAt,
        completedAt: accountDeletionRequests.completedAt,
      }).from(accountDeletionRequests)
        .where(eq(accountDeletionRequests.userId, userId))
        .limit(1)
        .for("update");
      if (existing) return this.deletionResponse(existing);

      await transaction.update(users).set({
        status: "DELETION_PENDING",
        updatedAt: now,
      }).where(and(eq(users.id, userId), eq(users.status, "ACTIVE")));
      await transaction.update(refreshSessions).set({ revokedAt: now })
        .where(and(eq(refreshSessions.userId, userId), isNull(refreshSessions.revokedAt)));
      await transaction.update(sceneAnalyses).set({
        status: "CANCELLED",
        cancelledAt: now,
        updatedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        deviceAnalysis: null,
        timezone: null,
        latitude: null,
        longitude: null,
        locationAccuracyMeters: null,
      }).where(and(
        eq(sceneAnalyses.ownerUserId, userId),
        inArray(sceneAnalyses.status, ["QUEUED", "PROCESSING"]),
      ));
      await transaction.update(photoFeedbacks).set({
        status: "CANCELLED",
        cancelledAt: now,
        updatedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
      }).where(and(
        eq(photoFeedbacks.ownerUserId, userId),
        inArray(photoFeedbacks.status, ["QUEUED", "PROCESSING"]),
      ));
      const [created] = await transaction.insert(accountDeletionRequests).values({
        id: randomUUID(),
        userId,
        requestedAt: now,
        nextAttemptAt: now,
        expiresAt,
      }).returning({
        id: accountDeletionRequests.id,
        status: accountDeletionRequests.status,
        requestedAt: accountDeletionRequests.requestedAt,
        completedAt: accountDeletionRequests.completedAt,
      });
      return this.deletionResponse(created);
    });
  }

  async getDeletion(principal: AccessPrincipal, deletionId: string) {
    const [request] = await this.database.select({
      id: accountDeletionRequests.id,
      userId: accountDeletionRequests.userId,
      status: accountDeletionRequests.status,
      requestedAt: accountDeletionRequests.requestedAt,
      completedAt: accountDeletionRequests.completedAt,
    }).from(accountDeletionRequests).where(and(
      eq(accountDeletionRequests.id, deletionId),
      eq(accountDeletionRequests.userId, principal.sub),
      gt(accountDeletionRequests.expiresAt, this.clock()),
    )).limit(1);
    if (!request) throw new ApiError({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
      message: "Account deletion request was not found",
    });
    return this.deletionResponse(request);
  }

  private async requireActiveMember(principal: AccessPrincipal): Promise<string> {
    const now = this.clock();
    const [member] = await this.database.select({
      id: users.id,
      accountType: users.accountType,
      status: users.status,
    }).from(users)
      .innerJoin(refreshSessions, and(
        eq(refreshSessions.id, principal.sid),
        eq(refreshSessions.userId, users.id),
        isNull(refreshSessions.revokedAt),
        gt(refreshSessions.expiresAt, now),
      ))
      .where(eq(users.id, principal.sub)).limit(1);
    if (!member || member.status !== "ACTIVE") throw new ApiError({
      statusCode: 401,
      code: "INVALID_TOKEN",
      message: "User session is no longer active",
    });
    if (member.accountType !== "MEMBER") throw new ApiError({
      statusCode: 403,
      code: "AUTH_REQUIRED",
      message: "Member login is required",
    });
    return member.id;
  }

  private deletionResponse(request: {
    id: string;
    status: "PENDING" | "PROCESSING" | "COMPLETED";
    requestedAt: Date;
    completedAt: Date | null;
  }) {
    return {
      deletionId: request.id,
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
      completedAt: request.completedAt?.toISOString() ?? null,
    };
  }
}

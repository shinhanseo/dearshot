import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { AuthConfig } from "../config/environment.js";
import type { Database } from "../db/client.js";
import { authIdentities, refreshSessions, userPreferences, users } from "../db/schema/identity.js";
import { ApiError } from "../http/api-error.js";
import type { AccessPrincipal, TokenService } from "./token-service.js";

const GUEST_SCENE_ANALYSIS_LIMIT = 5;
const GUEST_PHOTO_FEEDBACK_LIMIT = 10;

type TokenPair = {
  tokenType: "Bearer";
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

type SessionResult = {
  userId: string;
  accountType: "GUEST" | "MEMBER";
  role: "USER" | "ADMIN";
  sessionId: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

type RefreshFailure = "INVALID" | "EXPIRED" | "REUSED";

export type GuestAuthInput = {
  installationId: string;
  locale: string;
  appVersion: string;
};

export class AuthService {
  constructor(
    private readonly db: Database,
    private readonly tokenService: TokenService,
    private readonly config: AuthConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async createGuest(input: GuestAuthInput) {
    const now = this.clock();
    const session = await this.db.transaction(async (transaction): Promise<SessionResult> => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.installationId}, 0))`,
      );

      const [existing] = await transaction
        .select({
          sessionId: refreshSessions.id,
          tokenFamilyId: refreshSessions.tokenFamilyId,
          userId: users.id,
          accountType: users.accountType,
          role: users.role,
        })
        .from(refreshSessions)
        .innerJoin(users, eq(users.id, refreshSessions.userId))
        .where(
          and(
            eq(refreshSessions.installationId, input.installationId),
            isNull(refreshSessions.revokedAt),
            gt(refreshSessions.expiresAt, now),
            eq(users.accountType, "GUEST"),
            eq(users.status, "ACTIVE"),
          ),
        )
        .orderBy(desc(refreshSessions.createdAt))
        .limit(1)
        .for("update");

      const userId = existing?.userId ?? randomUUID();
      const sessionId = randomUUID();
      const tokenFamilyId = existing?.tokenFamilyId ?? randomUUID();
      const refreshToken = this.tokenService.createRefreshToken();
      const refreshTokenExpiresAt = new Date(
        now.getTime() + this.config.refreshTokenTtlSeconds * 1_000,
      );

      if (!existing) {
        await transaction.insert(users).values({ id: userId });
        await transaction.insert(userPreferences).values({
          userId,
          locale: input.locale,
        });
      } else {
        await transaction
          .update(userPreferences)
          .set({ locale: input.locale, updatedAt: now })
          .where(eq(userPreferences.userId, userId));
      }

      await transaction.insert(refreshSessions).values({
        id: sessionId,
        userId,
        installationId: input.installationId,
        tokenHash: refreshToken.hash,
        tokenFamilyId,
        expiresAt: refreshTokenExpiresAt,
      });

      if (existing) {
        await transaction
          .update(refreshSessions)
          .set({ revokedAt: now, replacedById: sessionId, lastUsedAt: now })
          .where(eq(refreshSessions.id, existing.sessionId));
      }

      return {
        userId,
        accountType: existing?.accountType ?? "GUEST",
        role: existing?.role ?? "USER",
        sessionId,
        refreshToken: refreshToken.plaintext,
        refreshTokenExpiresAt,
      };
    });

    return {
      ...(await this.createTokenPair(session, now)),
      principal: { id: session.userId, type: "GUEST" as const },
      limits: {
        sceneAnalysesRemainingToday: GUEST_SCENE_ANALYSIS_LIMIT,
        photoFeedbacksRemainingToday: GUEST_PHOTO_FEEDBACK_LIMIT,
      },
    };
  }

  async refresh(plaintextRefreshToken: string): Promise<TokenPair> {
    const now = this.clock();
    const tokenHash = this.tokenService.hashRefreshToken(plaintextRefreshToken);
    const outcome = await this.db.transaction(
      async (transaction): Promise<{ session: SessionResult } | { failure: RefreshFailure }> => {
        const [current] = await transaction
          .select({
            sessionId: refreshSessions.id,
            userId: refreshSessions.userId,
            installationId: refreshSessions.installationId,
            tokenFamilyId: refreshSessions.tokenFamilyId,
            expiresAt: refreshSessions.expiresAt,
            revokedAt: refreshSessions.revokedAt,
            replacedById: refreshSessions.replacedById,
            accountType: users.accountType,
            role: users.role,
            userStatus: users.status,
          })
          .from(refreshSessions)
          .innerJoin(users, eq(users.id, refreshSessions.userId))
          .where(eq(refreshSessions.tokenHash, tokenHash))
          .limit(1)
          .for("update");

        if (!current) return { failure: "INVALID" };

        if (current.revokedAt) {
          if (current.replacedById) {
            await transaction
              .update(refreshSessions)
              .set({ revokedAt: now })
              .where(
                and(
                  eq(refreshSessions.tokenFamilyId, current.tokenFamilyId),
                  isNull(refreshSessions.revokedAt),
                ),
              );
            return { failure: "REUSED" };
          }
          return { failure: "INVALID" };
        }

        if (current.expiresAt <= now) {
          await transaction
            .update(refreshSessions)
            .set({ revokedAt: now, lastUsedAt: now })
            .where(eq(refreshSessions.id, current.sessionId));
          return { failure: "EXPIRED" };
        }

        if (current.userStatus !== "ACTIVE") {
          await transaction
            .update(refreshSessions)
            .set({ revokedAt: now })
            .where(
              and(
                eq(refreshSessions.tokenFamilyId, current.tokenFamilyId),
                isNull(refreshSessions.revokedAt),
              ),
            );
          return { failure: "INVALID" };
        }

        const nextSessionId = randomUUID();
        const nextRefreshToken = this.tokenService.createRefreshToken();
        const nextExpiresAt = new Date(
          now.getTime() + this.config.refreshTokenTtlSeconds * 1_000,
        );

        await transaction.insert(refreshSessions).values({
          id: nextSessionId,
          userId: current.userId,
          installationId: current.installationId,
          tokenHash: nextRefreshToken.hash,
          tokenFamilyId: current.tokenFamilyId,
          expiresAt: nextExpiresAt,
        });
        await transaction
          .update(refreshSessions)
          .set({ revokedAt: now, replacedById: nextSessionId, lastUsedAt: now })
          .where(eq(refreshSessions.id, current.sessionId));

        return {
          session: {
            userId: current.userId,
            accountType: current.accountType,
            role: current.role,
            sessionId: nextSessionId,
            refreshToken: nextRefreshToken.plaintext,
            refreshTokenExpiresAt: nextExpiresAt,
          },
        };
      },
    );

    if ("failure" in outcome) {
      const code = outcome.failure === "EXPIRED" ? "TOKEN_EXPIRED" : "INVALID_TOKEN";
      const message =
        outcome.failure === "REUSED"
          ? "Refresh token reuse was detected"
          : outcome.failure === "EXPIRED"
            ? "Refresh token has expired"
            : "Refresh token is invalid";
      throw new ApiError({ statusCode: 401, code, message });
    }

    return this.createTokenPair(outcome.session, now);
  }

  async logout(plaintextRefreshToken: string, principal: AccessPrincipal): Promise<void> {
    const now = this.clock();
    const tokenHash = this.tokenService.hashRefreshToken(plaintextRefreshToken);
    const revoked = await this.db.transaction(async (transaction) => {
      const [session] = await transaction
        .select({
          id: refreshSessions.id,
          expiresAt: refreshSessions.expiresAt,
          revokedAt: refreshSessions.revokedAt,
        })
        .from(refreshSessions)
        .where(
          and(
            eq(refreshSessions.tokenHash, tokenHash),
            eq(refreshSessions.userId, principal.sub),
            eq(refreshSessions.id, principal.sid),
          ),
        )
        .limit(1)
        .for("update");

      if (!session || session.revokedAt || session.expiresAt <= now) return false;

      await transaction
        .update(refreshSessions)
        .set({ revokedAt: now, lastUsedAt: now })
        .where(eq(refreshSessions.id, session.id));
      return true;
    });

    if (!revoked) {
      throw new ApiError({
        statusCode: 401,
        code: "INVALID_TOKEN",
        message: "Session is invalid",
      });
    }
  }

  async getMemberProfile(principal: AccessPrincipal) {
    const now = this.clock();
    const [result] = await this.db
      .select({
        id: users.id,
        accountType: users.accountType,
        role: users.role,
        status: users.status,
        displayName: users.displayName,
        profileImageUrl: users.profileImageUrl,
        locale: userPreferences.locale,
        defaultAspectRatio: userPreferences.defaultAspectRatio,
        allowLocationContext: userPreferences.allowLocationContext,
        aiProcessingConsentVersion: userPreferences.aiProcessingConsentVersion,
      })
      .from(users)
      .innerJoin(userPreferences, eq(userPreferences.userId, users.id))
      .innerJoin(
        refreshSessions,
        and(
          eq(refreshSessions.id, principal.sid),
          eq(refreshSessions.userId, users.id),
          isNull(refreshSessions.revokedAt),
          gt(refreshSessions.expiresAt, now),
        ),
      )
      .where(eq(users.id, principal.sub))
      .limit(1);

    if (!result || result.status !== "ACTIVE") {
      throw new ApiError({
        statusCode: 401,
        code: "INVALID_TOKEN",
        message: "User session is no longer active",
      });
    }

    if (result.accountType !== "MEMBER") {
      throw new ApiError({
        statusCode: 403,
        code: "AUTH_REQUIRED",
        message: "Member login is required",
      });
    }

    return this.getMemberResponse(result.id);
  }

  private async getMemberResponse(userId: string) {
    const [result, identities] = await Promise.all([
      this.db
        .select({
          id: users.id,
          displayName: users.displayName,
          profileImageUrl: users.profileImageUrl,
          locale: userPreferences.locale,
          defaultAspectRatio: userPreferences.defaultAspectRatio,
          allowLocationContext: userPreferences.allowLocationContext,
          aiProcessingConsentVersion: userPreferences.aiProcessingConsentVersion,
        })
        .from(users)
        .innerJoin(userPreferences, eq(userPreferences.userId, users.id))
        .where(eq(users.id, userId))
        .limit(1),
      this.db
        .select({ provider: authIdentities.provider })
        .from(authIdentities)
        .where(eq(authIdentities.userId, userId)),
    ]);
    const member = result[0];
    if (!member) {
      throw new ApiError({
        statusCode: 401,
        code: "INVALID_TOKEN",
        message: "User is unavailable",
      });
    }
    return {
      id: member.id,
      displayName: member.displayName ?? "DearShot user",
      profileImageUrl: member.profileImageUrl,
      providers: identities.map(({ provider }) => provider),
      preferences: {
        locale: member.locale,
        defaultAspectRatio: member.defaultAspectRatio,
        allowLocationContext: member.allowLocationContext,
        aiProcessingConsentVersion: member.aiProcessingConsentVersion ?? "unconfirmed",
      },
      counts: { likedTemplates: 0, bookmarkedTemplates: 0 },
    };
  }

  private async createTokenPair(session: SessionResult, now: Date): Promise<TokenPair> {
    const access = await this.tokenService.issueAccessToken(
      {
        sub: session.userId,
        sid: session.sessionId,
        principalType: session.accountType,
        role: session.role,
      },
      now,
    );

    return {
      tokenType: "Bearer",
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken: session.refreshToken,
      refreshTokenExpiresAt: session.refreshTokenExpiresAt.toISOString(),
    };
  }
}

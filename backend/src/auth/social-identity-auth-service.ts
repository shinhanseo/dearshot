import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { AuthConfig } from "../config/environment.js";
import type { Database } from "../db/client.js";
import {
  authIdentities,
  oauthNonceUses,
  refreshSessions,
  userPreferences,
  users,
} from "../db/schema/identity.js";
import { ApiError } from "../http/api-error.js";
import type { TokenService } from "./token-service.js";

export type AuthProvider = "GOOGLE" | "KAKAO";

export type VerifiedSocialIdentity = {
  provider: AuthProvider;
  subject: string;
  displayName: string | null;
  profileImageUrl: string | null;
  locale: string | null;
};

export type SocialIdentityAuthInput = {
  identity: VerifiedSocialIdentity;
  guestAccessToken?: string | null;
  device: {
    installationId: string;
    platform: "ANDROID";
    appVersion: string;
  };
  replayProtection?: {
    keyHash: string;
    expiresAt: Date;
  };
};

export class SocialIdentityAuthService {
  constructor(
    private readonly db: Database,
    private readonly tokenService: TokenService,
    private readonly config: AuthConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async authenticate(input: SocialIdentityAuthInput) {
    const now = this.clock();
    const guestPrincipal = input.guestAccessToken
      ? await this.tokenService.verifyAccessToken(input.guestAccessToken, now)
      : null;
    if (guestPrincipal && guestPrincipal.principalType !== "GUEST") {
      throw invalidGuestToken();
    }

    const result = await this.db.transaction(async (transaction) => {
      const identityLockKey = `${input.identity.provider}:${input.identity.subject}`;
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${identityLockKey}, 0))`,
      );

      if (input.replayProtection) {
        const [consumedReplayKey] = await transaction
          .insert(oauthNonceUses)
          .values({
            nonceHash: input.replayProtection.keyHash,
            provider: input.identity.provider,
            tokenExpiresAt: input.replayProtection.expiresAt,
            usedAt: now,
          })
          .onConflictDoNothing()
          .returning({ nonceHash: oauthNonceUses.nonceHash });
        if (!consumedReplayKey) {
          throw new ApiError({
            statusCode: 401,
            code: "INVALID_TOKEN",
            message: "Social login token is invalid",
          });
        }
      }

      let guestUserId: string | null = null;
      if (guestPrincipal) {
        const [guest] = await transaction
          .select({ userId: users.id })
          .from(refreshSessions)
          .innerJoin(users, eq(users.id, refreshSessions.userId))
          .where(
            and(
              eq(refreshSessions.id, guestPrincipal.sid),
              eq(refreshSessions.userId, guestPrincipal.sub),
              eq(refreshSessions.installationId, input.device.installationId),
              isNull(refreshSessions.revokedAt),
              gt(refreshSessions.expiresAt, now),
              eq(users.accountType, "GUEST"),
              eq(users.status, "ACTIVE"),
            ),
          )
          .limit(1)
          .for("update");
        if (!guest) throw invalidGuestToken();
        guestUserId = guest.userId;
      }

      const [existingIdentity] = await transaction
        .select({
          userId: authIdentities.userId,
          accountType: users.accountType,
          role: users.role,
          status: users.status,
        })
        .from(authIdentities)
        .innerJoin(users, eq(users.id, authIdentities.userId))
        .where(
          and(
            eq(authIdentities.provider, input.identity.provider),
            eq(authIdentities.providerSubject, input.identity.subject),
          ),
        )
        .limit(1)
        .for("update");

      let userId: string;
      let role: "USER" | "ADMIN";
      let isNewUser: boolean;

      if (existingIdentity) {
        if (existingIdentity.status !== "ACTIVE" || existingIdentity.accountType !== "MEMBER") {
          throw new ApiError({
            statusCode: 401,
            code: "INVALID_TOKEN",
            message: "Social account is unavailable",
          });
        }
        userId = existingIdentity.userId;
        role = existingIdentity.role;
        isNewUser = false;

        if (guestUserId && guestUserId !== userId) {
          await transaction
            .update(refreshSessions)
            .set({ revokedAt: now })
            .where(and(eq(refreshSessions.userId, guestUserId), isNull(refreshSessions.revokedAt)));
          await transaction
            .update(users)
            .set({ status: "DELETION_PENDING", updatedAt: now })
            .where(eq(users.id, guestUserId));
        }

        await transaction
          .update(users)
          .set({
            ...(input.identity.displayName
              ? { displayName: input.identity.displayName }
              : {}),
            ...(input.identity.profileImageUrl
              ? { profileImageUrl: input.identity.profileImageUrl }
              : {}),
            updatedAt: now,
          })
          .where(eq(users.id, userId));
      } else if (guestUserId) {
        userId = guestUserId;
        role = "USER";
        isNewUser = true;
        await transaction.insert(authIdentities).values({
          userId,
          provider: input.identity.provider,
          providerSubject: input.identity.subject,
        });
        await transaction
          .update(users)
          .set({
            accountType: "MEMBER",
            displayName: input.identity.displayName,
            profileImageUrl: input.identity.profileImageUrl,
            updatedAt: now,
          })
          .where(eq(users.id, userId));
        await transaction
          .update(refreshSessions)
          .set({ revokedAt: now })
          .where(and(eq(refreshSessions.userId, userId), isNull(refreshSessions.revokedAt)));
      } else {
        userId = randomUUID();
        role = "USER";
        isNewUser = true;
        await transaction.insert(users).values({
          id: userId,
          accountType: "MEMBER",
          displayName: input.identity.displayName,
          profileImageUrl: input.identity.profileImageUrl,
        });
        await transaction.insert(userPreferences).values({
          userId,
          locale: input.identity.locale ?? "en-US",
        });
        await transaction.insert(authIdentities).values({
          userId,
          provider: input.identity.provider,
          providerSubject: input.identity.subject,
        });
      }

      const sessionId = randomUUID();
      const refreshToken = this.tokenService.createRefreshToken();
      const refreshTokenExpiresAt = new Date(
        now.getTime() + this.config.refreshTokenTtlSeconds * 1_000,
      );
      await transaction.insert(refreshSessions).values({
        id: sessionId,
        userId,
        installationId: input.device.installationId,
        tokenHash: refreshToken.hash,
        tokenFamilyId: randomUUID(),
        expiresAt: refreshTokenExpiresAt,
      });

      return {
        isNewUser,
        userId,
        role,
        sessionId,
        refreshToken: refreshToken.plaintext,
        refreshTokenExpiresAt,
      };
    });

    const [access, user] = await Promise.all([
      this.tokenService.issueAccessToken(
        {
          sub: result.userId,
          sid: result.sessionId,
          principalType: "MEMBER",
          role: result.role,
        },
        now,
      ),
      this.getMember(result.userId),
    ]);

    return {
      tokenType: "Bearer" as const,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken: result.refreshToken,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt.toISOString(),
      isNewUser: result.isNewUser,
      user,
    };
  }

  private async getMember(userId: string) {
    const [rows, identities] = await Promise.all([
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
    const member = rows[0];
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
}

function invalidGuestToken() {
  return new ApiError({
    statusCode: 401,
    code: "INVALID_TOKEN",
    message: "Guest access token is invalid",
  });
}

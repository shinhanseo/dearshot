import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { AccessPrincipal } from "../auth/token-service.js";
import type { Database } from "../db/client.js";
import { templateBookmarks, templateLikes, templates } from "../db/schema/catalog.js";
import { refreshSessions, users } from "../db/schema/identity.js";
import { ApiError } from "../http/api-error.js";

export class TemplateInteractionService {
  constructor(
    private readonly database: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async resolveMember(principal: AccessPrincipal, allowGuest: false): Promise<string>;
  async resolveMember(principal: AccessPrincipal, allowGuest: true): Promise<string | undefined>;
  async resolveMember(principal: AccessPrincipal, allowGuest: boolean): Promise<string | undefined> {
    if (principal.principalType === "GUEST" && allowGuest) return undefined;
    if (principal.principalType === "GUEST") this.memberRequired();

    const [member] = await this.database
      .select({ accountType: users.accountType, status: users.status })
      .from(users)
      .innerJoin(
        refreshSessions,
        and(
          eq(refreshSessions.id, principal.sid),
          eq(refreshSessions.userId, users.id),
          isNull(refreshSessions.revokedAt),
          gt(refreshSessions.expiresAt, this.clock()),
        ),
      )
      .where(eq(users.id, principal.sub))
      .limit(1);

    if (!member || member.status !== "ACTIVE") {
      throw new ApiError({
        statusCode: 401,
        code: "INVALID_TOKEN",
        message: "User session is no longer active",
      });
    }
    if (member.accountType !== "MEMBER") this.memberRequired();
    return principal.sub;
  }

  async setLike(principal: AccessPrincipal, templateId: string, liked: boolean) {
    const userId = await this.resolveMember(principal, false);
    return this.database.transaction(async (transaction) => {
      const [template] = await transaction
        .select({ id: templates.id, likeCount: templates.likeCount })
        .from(templates)
        .where(and(eq(templates.id, templateId), eq(templates.status, "PUBLISHED")))
        .limit(1)
        .for("update");
      if (!template) this.templateNotFound();

      if (liked) {
        const inserted = await transaction
          .insert(templateLikes)
          .values({ userId, templateId })
          .onConflictDoNothing()
          .returning({ templateId: templateLikes.templateId });
        if (inserted.length === 0) return { templateId, liked: true, likeCount: template.likeCount };
        const [updated] = await transaction
          .update(templates)
          .set({ likeCount: sql`${templates.likeCount} + 1` })
          .where(eq(templates.id, templateId))
          .returning({ likeCount: templates.likeCount });
        return { templateId, liked: true, likeCount: updated.likeCount };
      }

      const deleted = await transaction
        .delete(templateLikes)
        .where(and(eq(templateLikes.userId, userId), eq(templateLikes.templateId, templateId)))
        .returning({ templateId: templateLikes.templateId });
      if (deleted.length === 0) return { templateId, liked: false, likeCount: template.likeCount };
      const [updated] = await transaction
        .update(templates)
        .set({ likeCount: sql`greatest(${templates.likeCount} - 1, 0)` })
        .where(eq(templates.id, templateId))
        .returning({ likeCount: templates.likeCount });
      return { templateId, liked: false, likeCount: updated.likeCount };
    });
  }

  async setBookmark(principal: AccessPrincipal, templateId: string, bookmarked: boolean) {
    const userId = await this.resolveMember(principal, false);
    return this.database.transaction(async (transaction) => {
      const [template] = await transaction
        .select({ id: templates.id })
        .from(templates)
        .where(and(eq(templates.id, templateId), eq(templates.status, "PUBLISHED")))
        .limit(1)
        .for("update");
      if (!template) this.templateNotFound();

      if (bookmarked) {
        await transaction
          .insert(templateBookmarks)
          .values({ userId, templateId })
          .onConflictDoNothing();
      } else {
        await transaction
          .delete(templateBookmarks)
          .where(
            and(
              eq(templateBookmarks.userId, userId),
              eq(templateBookmarks.templateId, templateId),
            ),
          );
      }
      return { templateId, bookmarked };
    });
  }

  private memberRequired(): never {
    throw new ApiError({
      statusCode: 403,
      code: "AUTH_REQUIRED",
      message: "Member login is required",
    });
  }

  private templateNotFound(): never {
    throw new ApiError({
      statusCode: 404,
      code: "RESOURCE_NOT_FOUND",
      message: "Template was not found",
    });
  }
}

import { and, eq, gt, isNull } from "drizzle-orm";
import type { AccessPrincipal } from "../auth/token-service.js";
import type { Database } from "../db/client.js";
import { appEvents } from "../db/schema/analytics.js";
import { refreshSessions, users } from "../db/schema/identity.js";
import { ApiError } from "../http/api-error.js";
import type { AppEventBatch } from "./event-schema.js";

export type AppEventServiceConfig = {
  retentionDays: number;
  maximumPastAgeDays: number;
  maximumFutureSkewSeconds: number;
};

export class AppEventService {
  constructor(
    private readonly database: Database,
    private readonly config: AppEventServiceConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async ingest(principal: AccessPrincipal, requestId: string, batch: AppEventBatch) {
    const now = this.clock();
    const [active] = await this.database
      .select({ accountType: users.accountType, status: users.status })
      .from(users)
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

    if (!active || active.status !== "ACTIVE" || active.accountType !== principal.principalType) {
      throw new ApiError({
        statusCode: 401,
        code: "INVALID_TOKEN",
        message: "User session is no longer active",
      });
    }

    const oldest = now.getTime() - this.config.maximumPastAgeDays * 86_400_000;
    const newest = now.getTime() + this.config.maximumFutureSkewSeconds * 1_000;
    const invalidEvent = batch.events.find((event) => {
      const timestamp = Date.parse(event.occurredAt);
      return timestamp < oldest || timestamp > newest;
    });
    if (invalidEvent) {
      throw new ApiError({
        statusCode: 422,
        code: "INVALID_EVENT_TIME",
        message: "Event timestamp is outside the accepted window",
        details: { eventId: invalidEvent.eventId },
      });
    }

    const expiresAt = new Date(now.getTime() + this.config.retentionDays * 86_400_000);
    const inserted = await this.database
      .insert(appEvents)
      .values(
        batch.events.map((event) => ({
          eventId: event.eventId,
          actorId: principal.sub,
          actorType: principal.principalType,
          sessionId: batch.sessionId,
          eventName: event.eventName,
          appVersion: batch.appVersion,
          osVersion: batch.osVersion,
          locale: batch.locale,
          properties: event.properties,
          requestId,
          occurredAt: new Date(event.occurredAt),
          receivedAt: now,
          expiresAt,
        })),
      )
      .onConflictDoNothing({ target: [appEvents.actorId, appEvents.eventId] })
      .returning({ eventId: appEvents.eventId });

    return { accepted: inserted.length, duplicates: batch.events.length - inserted.length };
  }
}

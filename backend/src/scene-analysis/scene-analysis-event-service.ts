import { and, asc, eq, gt } from "drizzle-orm";
import type { AccessPrincipal } from "../auth/token-service.js";
import type { Database } from "../db/client.js";
import { sceneAnalyses, sceneAnalysisEvents } from "../db/schema/jobs.js";
import { ApiError } from "../http/api-error.js";
import type { UploadService } from "../uploads/upload-service.js";

export type SceneAnalysisEventServiceConfig = {
  pollIntervalMillis: number;
  heartbeatSeconds: number;
};

export type SceneStreamItem =
  | { kind: "event"; id: string; event: string; data: Record<string, unknown> }
  | { kind: "heartbeat" };

const terminalEventTypes = new Set(["completed", "failed"]);
const terminalStatuses = new Set([
  "COMPLETED",
  "NEEDS_USER_SELECTION",
  "FAILED",
  "CANCELLED",
]);

export class SceneAnalysisEventService {
  constructor(
    private readonly database: Database,
    private readonly uploads: UploadService,
    private readonly config: SceneAnalysisEventServiceConfig,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async authorize(principal: AccessPrincipal, analysisId: string): Promise<void> {
    const ownerUserId = await this.uploads.resolveActivePrincipal(principal);
    const [analysis] = await this.database
      .select({
        expiresAt: sceneAnalyses.expiresAt,
        eventsExpiresAt: sceneAnalyses.eventsExpiresAt,
      })
      .from(sceneAnalyses)
      .where(and(eq(sceneAnalyses.id, analysisId), eq(sceneAnalyses.ownerUserId, ownerUserId)))
      .limit(1);
    if (!analysis) {
      throw new ApiError({
        statusCode: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "Scene analysis was not found",
      });
    }
    if (analysis.expiresAt <= this.clock()) {
      throw new ApiError({
        statusCode: 410,
        code: "EVENTS_EXPIRED",
        message: "Scene analysis events have expired",
      });
    }
    if (analysis.eventsExpiresAt && analysis.eventsExpiresAt <= this.clock()) {
      throw new ApiError({
        statusCode: 410,
        code: "EVENTS_EXPIRED",
        message: "Scene analysis events have expired",
      });
    }
  }

  async *stream(
    analysisId: string,
    lastEventId: bigint,
    signal: AbortSignal,
  ): AsyncGenerator<SceneStreamItem> {
    let cursor = lastEventId;
    let lastWriteAt = this.clock().getTime();
    const heartbeatMillis = this.config.heartbeatSeconds * 1_000;

    while (!signal.aborted) {
      const events = await this.database
        .select({
          id: sceneAnalysisEvents.id,
          eventType: sceneAnalysisEvents.eventType,
          payload: sceneAnalysisEvents.payload,
        })
        .from(sceneAnalysisEvents)
        .where(and(
          eq(sceneAnalysisEvents.analysisId, analysisId),
          gt(sceneAnalysisEvents.id, cursor),
          gt(sceneAnalysisEvents.expiresAt, this.clock()),
        ))
        .orderBy(asc(sceneAnalysisEvents.id))
        .limit(100);

      if (events.length > 0) {
        for (const event of events) {
          cursor = event.id;
          lastWriteAt = this.clock().getTime();
          yield {
            kind: "event",
            id: event.id.toString(),
            event: event.eventType,
            data: event.payload,
          };
          if (terminalEventTypes.has(event.eventType)) return;
        }
        continue;
      }

      const [analysis] = await this.database
        .select({ status: sceneAnalyses.status, expiresAt: sceneAnalyses.expiresAt })
        .from(sceneAnalyses)
        .where(eq(sceneAnalyses.id, analysisId))
        .limit(1);
      if (!analysis || terminalStatuses.has(analysis.status) || analysis.expiresAt <= this.clock()) {
        return;
      }

      if (this.clock().getTime() - lastWriteAt >= heartbeatMillis) {
        lastWriteAt = this.clock().getTime();
        yield { kind: "heartbeat" };
      }
      await abortableDelay(this.config.pollIntervalMillis, signal);
    }
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    timer.unref();
    signal.addEventListener("abort", finish, { once: true });
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}

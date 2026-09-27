import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireAccessToken } from "../auth/authentication.js";
import type { TokenService } from "../auth/token-service.js";
import { ApiError } from "../http/api-error.js";
import { validateBody } from "../http/validation.js";
import { createSceneAnalysisSchema, type CreateSceneAnalysisRequest } from "../scene-analysis/scene-analysis-schema.js";
import type { SceneAnalysisService } from "../scene-analysis/scene-analysis-service.js";
import type { SceneAnalysisEventService } from "../scene-analysis/scene-analysis-event-service.js";

const uuidSchema = z.uuid();

export function createSceneAnalysisRouter(
  tokenService: TokenService,
  service: SceneAnalysisService,
  eventService: SceneAnalysisEventService,
  ipRateLimiter?: RequestHandler,
) {
  const router = Router();
  const authenticated = requireAccessToken(tokenService);

  router.post(
    "/scene-analyses",
    authenticated,
    ...(ipRateLimiter ? [ipRateLimiter] : []),
    validateBody(createSceneAnalysisSchema),
    async (request, response, next) => {
      try {
        const key = uuidSchema.safeParse(request.get("Idempotency-Key"));
        if (!key.success) {
          throw new ApiError({ statusCode: 400, code: "INVALID_REQUEST", message: "A valid Idempotency-Key UUID is required" });
        }
        const result = await service.create(request.auth!, request.body as CreateSceneAnalysisRequest, key.data);
        if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
        response.status(result.statusCode).json(result.body);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/scene-analyses/:analysisId", authenticated, async (request, response, next) => {
    try {
      response.json(await service.get(request.auth!, parseId(request.params.analysisId)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/scene-analyses/:analysisId/events", authenticated, async (request, response, next) => {
    const abortController = new AbortController();
    response.once("close", () => abortController.abort());
    try {
      const analysisId = parseId(request.params.analysisId);
      const lastEventId = parseLastEventId(request.get("Last-Event-ID"));
      await eventService.authorize(request.auth!, analysisId);

      response.status(200);
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("Connection", "keep-alive");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders();

      for await (const item of eventService.stream(
        analysisId,
        lastEventId,
        abortController.signal,
      )) {
        if (item.kind === "heartbeat") {
          response.write(": heartbeat\n\n");
        } else {
          response.write(`id: ${item.id}\nevent: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`);
        }
      }
      response.end();
    } catch (error) {
      if (response.headersSent) {
        request.log.warn({ err: error }, "Scene analysis SSE stream failed");
        response.end();
        return;
      }
      next(error);
    }
  });

  router.delete("/scene-analyses/:analysisId", authenticated, async (request, response, next) => {
    try {
      await service.cancel(request.auth!, parseId(request.params.analysisId));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseLastEventId(value: string | undefined): bigint {
  if (value === undefined) return 0n;
  if (!/^(0|[1-9]\d{0,18})$/u.test(value)) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_REQUEST",
      message: "Last-Event-ID must be a non-negative integer",
    });
  }
  const parsed = BigInt(value);
  if (parsed > 9_223_372_036_854_775_807n) {
    throw new ApiError({
      statusCode: 400,
      code: "INVALID_REQUEST",
      message: "Last-Event-ID is outside the supported range",
    });
  }
  return parsed;
}

function parseId(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError({ statusCode: 400, code: "INVALID_REQUEST", message: "Scene analysis ID is invalid" });
  }
  return parsed.data;
}

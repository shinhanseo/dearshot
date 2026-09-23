import { Router, type RequestHandler } from "express";
import { requireAccessToken } from "../auth/authentication.js";
import type { TokenService } from "../auth/token-service.js";
import { validateBody } from "../http/validation.js";
import type { AppEventService } from "../product-events/app-event-service.js";
import { appEventBatchSchema, type AppEventBatch } from "../product-events/event-schema.js";

export function createAppEventRouter(
  tokenService: TokenService,
  service: AppEventService,
  ipRateLimiter?: RequestHandler,
) {
  const router = Router();

  router.post(
    "/app-events/batch",
    ...(ipRateLimiter ? [ipRateLimiter] : []),
    requireAccessToken(tokenService),
    validateBody(appEventBatchSchema),
    async (request, response, next) => {
      try {
        const result = await service.ingest(
          request.auth!,
          request.requestId,
          request.body as AppEventBatch,
        );
        response.status(202).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}

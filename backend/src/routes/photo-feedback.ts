import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireAccessToken } from "../auth/authentication.js";
import type { TokenService } from "../auth/token-service.js";
import { ApiError } from "../http/api-error.js";
import { validateBody } from "../http/validation.js";
import { createPhotoFeedbackSchema, type CreatePhotoFeedbackRequest } from "../photo-feedback/photo-feedback-schema.js";
import type { PhotoFeedbackService } from "../photo-feedback/photo-feedback-service.js";

const uuidSchema = z.uuid();

export function createPhotoFeedbackRouter(
  tokenService: TokenService,
  service: PhotoFeedbackService,
  ipRateLimiter?: RequestHandler,
) {
  const router = Router();
  const authenticated = requireAccessToken(tokenService);

  router.post(
    "/photo-feedbacks",
    authenticated,
    ...(ipRateLimiter ? [ipRateLimiter] : []),
    validateBody(createPhotoFeedbackSchema),
    async (request, response, next) => {
      try {
        const key = uuidSchema.safeParse(request.get("Idempotency-Key"));
        if (!key.success) {
          throw new ApiError({ statusCode: 400, code: "INVALID_REQUEST", message: "A valid Idempotency-Key UUID is required" });
        }
        const result = await service.create(request.auth!, request.body as CreatePhotoFeedbackRequest, key.data);
        if (result.replayed) response.setHeader("Idempotency-Replayed", "true");
        response.status(result.statusCode).json(result.body);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/photo-feedbacks/:feedbackId", authenticated, async (request, response, next) => {
    try {
      response.json(await service.get(request.auth!, parseId(request.params.feedbackId)));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/photo-feedbacks/:feedbackId", authenticated, async (request, response, next) => {
    try {
      await service.cancel(request.auth!, parseId(request.params.feedbackId));
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function parseId(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError({ statusCode: 400, code: "INVALID_REQUEST", message: "Photo feedback ID is invalid" });
  }
  return parsed.data;
}

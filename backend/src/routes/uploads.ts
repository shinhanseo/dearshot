import { Router } from "express";
import { z } from "zod";
import { requireAccessToken } from "../auth/authentication.js";
import type { TokenService } from "../auth/token-service.js";
import type { ImageStorage } from "../uploads/image-storage.js";
import type { UploadService } from "../uploads/upload-service.js";
import { ApiError } from "../http/api-error.js";

const uploadIdSchema = z.uuid();

export function createUploadRouter(
  tokenService: TokenService,
  uploadService: UploadService,
  imageStorage: ImageStorage,
) {
  const router = Router();
  const authenticated = requireAccessToken(tokenService);

  router.post("/uploads", authenticated, async (request, response, next) => {
    try {
      const ownerUserId = await uploadService.resolveActivePrincipal(request.auth!);
      const accepted = await imageStorage.acceptMultipart(request);
      const created = await uploadService.createReady(
        ownerUserId,
        accepted.purpose,
        accepted.image,
      );
      response.status(201).json({
        ...created,
        expiresAt: created.expiresAt.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/uploads/:uploadId", authenticated, async (request, response, next) => {
    try {
      const parsed = uploadIdSchema.safeParse(request.params.uploadId);
      if (!parsed.success) {
        throw new ApiError({
          statusCode: 400,
          code: "INVALID_REQUEST",
          message: "Upload ID is invalid",
        });
      }
      const uploadId = parsed.data;
      await uploadService.delete(request.auth!, uploadId);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}

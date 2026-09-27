import { Router } from "express";
import { z } from "zod";
import { requireAccessToken } from "../auth/authentication.js";
import type { TokenService } from "../auth/token-service.js";
import type { AccountService } from "../account/account-service.js";
import { ApiError } from "../http/api-error.js";
import { validateBody } from "../http/validation.js";

const preferencesSchema = z.strictObject({
  locale: z.string().min(2).max(35).optional(),
  defaultAspectRatio: z.enum(["4:3", "9:16", "1:1"]).optional(),
  allowLocationContext: z.boolean().optional(),
  aiProcessingConsentVersion: z.string().min(1).max(32).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one preference is required");

const parseDeletionId = (value: string | string[]) => {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new ApiError({
    statusCode: 400,
    code: "INVALID_REQUEST",
    message: "Deletion ID is invalid",
  });
  return parsed.data;
};

export function createAccountRouter(
  tokenService: TokenService,
  accountService: AccountService,
) {
  const router = Router();
  const authenticate = requireAccessToken(tokenService);

  router.patch("/me/preferences", authenticate, validateBody(preferencesSchema), async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(await accountService.updatePreferences(request.auth!, request.body));
  });

  router.delete("/me", authenticate, async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.status(202).json(await accountService.requestDeletion(request.auth!));
  });

  // The signed access token acts as the short-lived capability after all
  // refresh sessions have been revoked by DELETE /me.
  router.get(
    "/account-deletions/:deletionId",
    authenticate,
    async (request, response) => {
      response.setHeader("Cache-Control", "no-store");
      response.json(await accountService.getDeletion(
        request.auth!,
        parseDeletionId(request.params.deletionId),
      ));
    },
  );

  return router;
}

import { Router } from "express";
import { z } from "zod";
import { requireAccessToken } from "../auth/authentication.js";
import type { AuthService } from "../auth/auth-service.js";
import type { TokenService } from "../auth/token-service.js";
import { validateBody } from "../http/validation.js";

const guestAuthSchema = z.strictObject({
  installationId: z.uuid(),
  locale: z.string().min(2).max(35),
  appVersion: z.string().min(1).max(32),
});

const refreshTokenSchema = z.strictObject({
  refreshToken: z.string().min(32).max(256),
});

type AuthRouterDependencies = {
  authService: AuthService;
  tokenService: TokenService;
};

export function createAuthRouter({ authService, tokenService }: AuthRouterDependencies) {
  const router = Router();
  const authenticate = requireAccessToken(tokenService);

  router.use("/auth", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    next();
  });

  router.post("/auth/guest", validateBody(guestAuthSchema), async (request, response) => {
    const result = await authService.createGuest(request.body);
    response.status(201).json(result);
  });

  router.post("/auth/refresh", validateBody(refreshTokenSchema), async (request, response) => {
    const result = await authService.refresh(request.body.refreshToken);
    response.json(result);
  });

  router.post(
    "/auth/logout",
    authenticate,
    validateBody(refreshTokenSchema),
    async (request, response) => {
      await authService.logout(request.body.refreshToken, request.auth!);
      response.status(204).send();
    },
  );

  router.get("/me", authenticate, async (request, response) => {
    const result = await authService.getMemberProfile(request.auth!);
    response.json(result);
  });

  return router;
}

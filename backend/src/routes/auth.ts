import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { requireAccessToken } from "../auth/authentication.js";
import type { AuthService } from "../auth/auth-service.js";
import type { GoogleAuthService } from "../auth/google/google-auth-service.js";
import type { KakaoAuthService } from "../auth/kakao/kakao-auth-service.js";
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

const googleAuthSchema = z.strictObject({
  idToken: z.string().min(1).max(8_192),
  nonce: z.string().min(16).max(256),
  guestAccessToken: z.string().min(1).max(4_096).nullish(),
  device: z.strictObject({
    installationId: z.uuid(),
    platform: z.literal("ANDROID"),
    appVersion: z.string().min(1).max(32),
  }),
});

const kakaoAuthSchema = z.strictObject({
  accessToken: z.string().min(1).max(4_096),
  guestAccessToken: z.string().min(1).max(4_096).nullish(),
  device: z.strictObject({
    installationId: z.uuid(),
    platform: z.literal("ANDROID"),
    appVersion: z.string().min(1).max(32),
  }),
});

type AuthRouterDependencies = {
  authService: AuthService;
  googleAuthService: GoogleAuthService;
  kakaoAuthService: KakaoAuthService;
  tokenService: TokenService;
  ipRateLimiter?: RequestHandler;
};

export function createAuthRouter({
  authService,
  googleAuthService,
  kakaoAuthService,
  tokenService,
  ipRateLimiter,
}: AuthRouterDependencies) {
  const router = Router();
  const authenticate = requireAccessToken(tokenService);

  router.use("/auth", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    next();
  });
  if (ipRateLimiter) router.use("/auth", ipRateLimiter);

  router.post("/auth/guest", validateBody(guestAuthSchema), async (request, response) => {
    const result = await authService.createGuest(request.body);
    response.status(201).json(result);
  });

  router.post("/auth/google", validateBody(googleAuthSchema), async (request, response) => {
    const result = await googleAuthService.authenticate(request.body);
    response.json(result);
  });

  router.post("/auth/kakao", validateBody(kakaoAuthSchema), async (request, response) => {
    const result = await kakaoAuthService.authenticate(request.body);
    response.json(result);
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

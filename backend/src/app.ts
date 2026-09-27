import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import type { RequestHandler } from "express";
import type { AuthService } from "./auth/auth-service.js";
import type { GoogleAuthService } from "./auth/google/google-auth-service.js";
import type { KakaoAuthService } from "./auth/kakao/kakao-auth-service.js";
import type { TokenService } from "./auth/token-service.js";
import type { CatalogService } from "./catalog/catalog-service.js";
import type { TemplateInteractionService } from "./catalog/template-interaction-service.js";
import { ApiError } from "./http/api-error.js";
import { errorHandler } from "./http/error-handler.js";
import { createHttpLogger } from "./http/http-logger.js";
import { requestContext } from "./http/request-context.js";
import { createAuthRouter } from "./routes/auth.js";
import { createAppConfigRouter, type AppConfigRouteSettings } from "./routes/app-config.js";
import { createCatalogRouter } from "./routes/catalog.js";
import { createSceneAnalysisRouter } from "./routes/scene-analysis.js";
import { createUploadRouter } from "./routes/uploads.js";
import type { ImageStorage } from "./uploads/image-storage.js";
import type { UploadService } from "./uploads/upload-service.js";
import type { AppEventService } from "./product-events/app-event-service.js";
import { createAppEventRouter } from "./routes/app-events.js";
import type { SceneAnalysisService } from "./scene-analysis/scene-analysis-service.js";
import type { PhotoFeedbackService } from "./photo-feedback/photo-feedback-service.js";
import { createPhotoFeedbackRouter } from "./routes/photo-feedback.js";
import type { AccountService } from "./account/account-service.js";
import { createAccountRouter } from "./routes/account.js";

type AppDependencies = {
  checkDatabase: () => Promise<void>;
  logger: Logger;
  http?: {
    trustProxyHops: number;
    corsAllowedOrigins: string[];
  };
  auth?: {
    authService: AuthService;
    googleAuthService: GoogleAuthService;
    kakaoAuthService: KakaoAuthService;
    tokenService: TokenService;
    ipRateLimiter?: RequestHandler;
  };
  account?: { service: AccountService; tokenService: TokenService };
  catalog?: {
    service: CatalogService;
    assetRoot: string;
    interactionService?: TemplateInteractionService;
  };
  uploads?: {
    service: UploadService;
    storage: ImageStorage;
    tokenService: TokenService;
    ipRateLimiter?: RequestHandler;
  };
  appConfig?: AppConfigRouteSettings;
  productEvents?: {
    service: AppEventService;
    tokenService: TokenService;
    ipRateLimiter?: RequestHandler;
  };
  sceneAnalysis?: {
    service: SceneAnalysisService;
    tokenService: TokenService;
    ipRateLimiter?: RequestHandler;
  };
  photoFeedback?: {
    service: PhotoFeedbackService;
    tokenService: TokenService;
    ipRateLimiter?: RequestHandler;
  };
};

export function createApp({
  checkDatabase,
  logger,
  http,
  auth,
  account,
  catalog,
  uploads,
  appConfig,
  productEvents,
  sceneAnalysis,
  photoFeedback,
}: AppDependencies) {
  const app = express();

  // A wrong proxy count lets clients spoof request.ip and bypass IP-based controls.
  // Production sets this to one only when the API port is private behind Caddy.
  app.set("trust proxy", http?.trustProxyHops ?? 0);
  app.disable("x-powered-by");

  const allowedOrigins = new Set(http?.corsAllowedOrigins ?? []);

  app.use(requestContext);
  app.use(createHttpLogger(logger));
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }
        callback(
          new ApiError({
            statusCode: 403,
            code: "ORIGIN_NOT_ALLOWED",
            message: "Request origin is not allowed",
          }),
        );
      },
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Authorization",
        "Content-Type",
        "Idempotency-Key",
        "X-Request-ID",
      ],
      exposedHeaders: ["Idempotency-Replayed", "Retry-After", "X-Request-ID"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  if (catalog) {
    app.use(
      "/assets/catalog",
      express.static(catalog.assetRoot, { maxAge: "1h" }),
    );
  }

  app.get("/health", async (_request, response, next) => {
    try {
      await checkDatabase();
      response.json({ status: "ok", service: "dearshot-api", database: "ready" });
    } catch (cause) {
      next(
        new ApiError({
          statusCode: 503,
          code: "SERVICE_UNAVAILABLE",
          message: "Service is temporarily unavailable",
          cause,
        }),
      );
    }
  });

  if (auth) app.use("/api/v1", createAuthRouter(auth));
  if (account) app.use("/api/v1", createAccountRouter(account.tokenService, account.service));
  if (appConfig) app.use("/api/v1", createAppConfigRouter(appConfig));
  if (productEvents) {
    app.use(
      "/api/v1",
      createAppEventRouter(
        productEvents.tokenService,
        productEvents.service,
        productEvents.ipRateLimiter,
      ),
    );
  }
  if (uploads) {
    app.use(
      "/api/v1",
      createUploadRouter(
        uploads.tokenService,
        uploads.service,
        uploads.storage,
        uploads.ipRateLimiter,
      ),
    );
  }
  if (catalog) {
    app.use(
      "/api/v1",
      createCatalogRouter(
        catalog.service,
        auth && catalog.interactionService
          ? { tokenService: auth.tokenService, interactionService: catalog.interactionService }
          : undefined,
      ),
    );
  }
  if (sceneAnalysis) {
    app.use("/api/v1", createSceneAnalysisRouter(
      sceneAnalysis.tokenService,
      sceneAnalysis.service,
      sceneAnalysis.ipRateLimiter,
    ));
  }
  if (photoFeedback) {
    app.use("/api/v1", createPhotoFeedbackRouter(
      photoFeedback.tokenService,
      photoFeedback.service,
      photoFeedback.ipRateLimiter,
    ));
  }

  app.use((_request, _response, next) => {
    next(
      new ApiError({
        statusCode: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "Resource not found",
      }),
    );
  });

  app.use(errorHandler);

  return app;
}

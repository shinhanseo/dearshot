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
import { sceneAnalysisRouter } from "./routes/scene-analysis.js";
import { createUploadRouter } from "./routes/uploads.js";
import type { ImageStorage } from "./uploads/image-storage.js";
import type { UploadService } from "./uploads/upload-service.js";
import type { AppEventService } from "./product-events/app-event-service.js";
import { createAppEventRouter } from "./routes/app-events.js";

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
  enableMockSceneAnalysis?: boolean;
};

export function createApp({
  checkDatabase,
  logger,
  http,
  auth,
  catalog,
  uploads,
  appConfig,
  productEvents,
  enableMockSceneAnalysis = false,
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
      methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Authorization",
        "Content-Type",
        "Idempotency-Key",
        "Last-Event-ID",
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
  if (enableMockSceneAnalysis) {
    app.use("/api/v1/scene-analysis", sceneAnalysisRouter);
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

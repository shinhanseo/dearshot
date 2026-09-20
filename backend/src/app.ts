import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import type { AuthService } from "./auth/auth-service.js";
import type { GoogleAuthService } from "./auth/google/google-auth-service.js";
import type { KakaoAuthService } from "./auth/kakao/kakao-auth-service.js";
import type { TokenService } from "./auth/token-service.js";
import type { CatalogService } from "./catalog/catalog-service.js";
import { ApiError } from "./http/api-error.js";
import { errorHandler } from "./http/error-handler.js";
import { createHttpLogger } from "./http/http-logger.js";
import { requestContext } from "./http/request-context.js";
import { createAuthRouter } from "./routes/auth.js";
import { createCatalogRouter } from "./routes/catalog.js";
import { sceneAnalysisRouter } from "./routes/scene-analysis.js";

type AppDependencies = {
  checkDatabase: () => Promise<void>;
  logger: Logger;
  auth?: {
    authService: AuthService;
    googleAuthService: GoogleAuthService;
    kakaoAuthService: KakaoAuthService;
    tokenService: TokenService;
  };
  catalog?: { service: CatalogService; assetRoot: string };
};

export function createApp({ checkDatabase, logger, auth, catalog }: AppDependencies) {
  const app = express();

  app.use(requestContext);
  app.use(createHttpLogger(logger));
  app.use(helmet());
  app.use(cors());
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
  if (catalog) app.use("/api/v1", createCatalogRouter(catalog.service));
  app.use("/api/v1/scene-analysis", sceneAnalysisRouter);

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

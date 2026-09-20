import cors from "cors";
import express from "express";
import helmet from "helmet";
import type { Logger } from "pino";
import { ApiError } from "./http/api-error.js";
import { errorHandler } from "./http/error-handler.js";
import { createHttpLogger } from "./http/http-logger.js";
import { requestContext } from "./http/request-context.js";
import { sceneAnalysisRouter } from "./routes/scene-analysis.js";

type AppDependencies = {
  checkDatabase: () => Promise<void>;
  logger: Logger;
};

export function createApp({ checkDatabase, logger }: AppDependencies) {
  const app = express();

  app.use(requestContext);
  app.use(createHttpLogger(logger));
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

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

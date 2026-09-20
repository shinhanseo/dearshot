import cors from "cors";
import express from "express";
import helmet from "helmet";
import { sceneAnalysisRouter } from "./routes/scene-analysis.js";

type AppDependencies = {
  checkDatabase: () => Promise<void>;
};

export function createApp({ checkDatabase }: AppDependencies) {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", async (_request, response) => {
    try {
      await checkDatabase();
      response.json({ status: "ok", service: "dearshot-api", database: "ready" });
    } catch {
      response.status(503).json({
        status: "unavailable",
        service: "dearshot-api",
        database: "unavailable",
      });
    }
  });

  app.use("/api/v1/scene-analysis", sceneAnalysisRouter);

  app.use((_request, response) => {
    response.status(404).json({ code: "NOT_FOUND", message: "Resource not found" });
  });

  return app;
}

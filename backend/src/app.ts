import cors from "cors";
import express from "express";
import helmet from "helmet";
import { sceneAnalysisRouter } from "./routes/scene-analysis.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "dearshot-api" });
  });

  app.use("/api/v1/scene-analysis", sceneAnalysisRouter);

  app.use((_request, response) => {
    response.status(404).json({ code: "NOT_FOUND", message: "Resource not found" });
  });

  return app;
}


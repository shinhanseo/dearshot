import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../http/validation.js";

const requestSchema = z.object({
  imageReference: z.string().min(1),
  capturedAt: z.iso.datetime(),
  locale: z.string().min(2).default("en"),
  coarseLocation: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
});

export const sceneAnalysisRouter = Router();

sceneAnalysisRouter.post("/", validateBody(requestSchema), (_request, response) => {
  response.status(200).json({
    analysisId: crypto.randomUUID(),
    scene: {
      category: "beach",
      confidence: 0.92,
      clues: ["ocean", "open sky", "golden hour"],
    },
    recommendation: {
      templateIds: ["beach-breeze", "beach-horizon", "beach-walk"],
      reason: "Soft side light and an open horizon suit full-body portraits.",
    },
    source: "mock",
  });
});

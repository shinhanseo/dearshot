import { Router } from "express";
import { z } from "zod";
import type { Environment } from "../config/environment.js";
import { validateQuery } from "../http/validation.js";

const querySchema = z.object({
  platform: z.literal("android"),
  appVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/u).default("en-US"),
});

export type AppConfigRouteSettings = {
  app: Environment["appConfig"];
  guestLimits: Environment["usage"]["guest"];
  upload: Pick<Environment["uploads"], "maxBytes">;
};

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

export function createAppConfigRouter(settings: AppConfigRouteSettings) {
  const router = Router();

  router.get("/app-config", validateQuery(querySchema), (request, response) => {
    const query = request.query as z.infer<typeof querySchema>;
    response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    response.json({
      minimumSupportedVersion: settings.app.minimumSupportedVersion,
      latestVersion: settings.app.latestVersion,
      forceUpdate: compareVersions(query.appVersion, settings.app.minimumSupportedVersion) < 0,
      maintenance: settings.app.maintenance,
      catalogVersion: settings.app.catalogVersion,
      upload: {
        maxBytes: settings.upload.maxBytes,
        supportedContentTypes: ["image/jpeg", "image/webp"],
        recommendedLongEdgePx: settings.app.recommendedLongEdgePixels,
      },
      guestLimits: settings.guestLimits,
      legal: settings.app.legal,
      features: settings.app.features,
    });
  });

  return router;
}

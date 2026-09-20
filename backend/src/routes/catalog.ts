import { Router } from "express";
import { z } from "zod";
import type { CatalogService } from "../catalog/catalog-service.js";
import { ApiError } from "../http/api-error.js";

const localeSchema = z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/u).default("en-US");
const listTemplatesSchema = z.object({
  locale: localeSchema,
  scene: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).optional(),
  sort: z.enum(["recommended", "popular", "latest"]).default("recommended"),
  aspectRatio: z.enum(["4:3", "9:16", "1:1"]).optional(),
  peopleCount: z.coerce.number().int().min(1).max(10).optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const flattened = z.flattenError(parsed.error);
  throw new ApiError({
    statusCode: 400,
    code: "INVALID_REQUEST",
    message: "Request query is invalid",
    details: { formErrors: flattened.formErrors, fieldErrors: flattened.fieldErrors },
  });
}

export function createCatalogRouter(service: CatalogService) {
  const router = Router();

  router.get("/scenes", async (request, response, next) => {
    try {
      const query = parse(z.object({ locale: localeSchema }), request.query);
      response.json(await service.listScenes(query.locale));
    } catch (error) {
      next(error);
    }
  });

  router.get("/templates", async (request, response, next) => {
    try {
      response.json(await service.listTemplates(parse(listTemplatesSchema, request.query)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/templates/:templateId", async (request, response, next) => {
    try {
      const parameters = parse(
        z.object({ templateId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u) }),
        request.params,
      );
      const query = parse(
        z.object({ locale: localeSchema, version: z.coerce.number().int().positive().optional() }),
        request.query,
      );
      response.json(await service.getTemplate(parameters.templateId, query.locale, query.version));
    } catch (error) {
      next(error);
    }
  });

  return router;
}

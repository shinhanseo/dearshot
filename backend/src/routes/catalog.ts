import { Router, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { optionalAccessToken, requireAccessToken } from "../auth/authentication.js";
import type { TokenService } from "../auth/token-service.js";
import type { CatalogService } from "../catalog/catalog-service.js";
import type { TemplateInteractionService } from "../catalog/template-interaction-service.js";
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
const memberCollectionSchema = z.object({
  locale: localeSchema,
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const templateParametersSchema = z.object({
  templateId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
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

function setCatalogCacheHeaders(response: Response, memberId?: string) {
  response.vary("Authorization");
  response.setHeader(
    "Cache-Control",
    memberId ? "private, no-store" : "public, max-age=60",
  );
}

type CatalogAuthDependencies = {
  tokenService: TokenService;
  interactionService: TemplateInteractionService;
};

export function createCatalogRouter(
  service: CatalogService,
  auth?: CatalogAuthDependencies,
) {
  const router = Router();
  const optionalAuthenticate: RequestHandler = auth
    ? optionalAccessToken(auth.tokenService)
    : (_request, _response, next) => next();

  router.get("/scenes", async (request, response, next) => {
    try {
      const query = parse(z.object({ locale: localeSchema }), request.query);
      response.json(await service.listScenes(query.locale));
    } catch (error) {
      next(error);
    }
  });

  router.get("/templates", optionalAuthenticate, async (request, response, next) => {
    try {
      const memberId =
        auth && request.auth
          ? await auth.interactionService.resolveMember(request.auth, true)
          : undefined;
      setCatalogCacheHeaders(response, memberId);
      response.json(
        await service.listTemplates(parse(listTemplatesSchema, request.query), memberId),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/templates/:templateId", optionalAuthenticate, async (request, response, next) => {
    try {
      const parameters = parse(templateParametersSchema, request.params);
      const query = parse(
        z.object({ locale: localeSchema, version: z.coerce.number().int().positive().optional() }),
        request.query,
      );
      const memberId =
        auth && request.auth
          ? await auth.interactionService.resolveMember(request.auth, true)
          : undefined;
      setCatalogCacheHeaders(response, memberId);
      response.json(
        await service.getTemplate(parameters.templateId, query.locale, query.version, memberId),
      );
    } catch (error) {
      next(error);
    }
  });

  if (auth) {
    const authenticate = requireAccessToken(auth.tokenService);

    router.put("/templates/:templateId/like", authenticate, async (request, response, next) => {
      try {
        const { templateId } = parse(templateParametersSchema, request.params);
        response.setHeader("Cache-Control", "private, no-store");
        response.json(await auth.interactionService.setLike(request.auth!, templateId, true));
      } catch (error) {
        next(error);
      }
    });
    router.delete("/templates/:templateId/like", authenticate, async (request, response, next) => {
      try {
        const { templateId } = parse(templateParametersSchema, request.params);
        response.setHeader("Cache-Control", "private, no-store");
        response.json(await auth.interactionService.setLike(request.auth!, templateId, false));
      } catch (error) {
        next(error);
      }
    });
    router.put(
      "/templates/:templateId/bookmark",
      authenticate,
      async (request, response, next) => {
        try {
          const { templateId } = parse(templateParametersSchema, request.params);
          response.setHeader("Cache-Control", "private, no-store");
          response.json(
            await auth.interactionService.setBookmark(request.auth!, templateId, true),
          );
        } catch (error) {
          next(error);
        }
      },
    );
    router.delete(
      "/templates/:templateId/bookmark",
      authenticate,
      async (request, response, next) => {
        try {
          const { templateId } = parse(templateParametersSchema, request.params);
          response.setHeader("Cache-Control", "private, no-store");
          response.json(
            await auth.interactionService.setBookmark(request.auth!, templateId, false),
          );
        } catch (error) {
          next(error);
        }
      },
    );

    const collectionHandler = (kind: "liked" | "bookmarked"): RequestHandler =>
      async (request, response, next) => {
        try {
          const memberId = await auth.interactionService.resolveMember(request.auth!, false);
          response.setHeader("Cache-Control", "private, no-store");
          response.json(
            await service.listMemberTemplates(
              memberId,
              kind,
              parse(memberCollectionSchema, request.query),
            ),
          );
        } catch (error) {
          next(error);
        }
      };
    router.get("/me/liked-templates", authenticate, collectionHandler("liked"));
    router.get("/me/bookmarked-templates", authenticate, collectionHandler("bookmarked"));
  }

  return router;
}

import type { RequestHandler } from "express";
import { z } from "zod";
import { ApiError } from "./api-error.js";

export function validateBody(schema: z.ZodType): RequestHandler {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.body);

    if (!parsed.success) {
      const flattened = z.flattenError(parsed.error);
      next(
        new ApiError({
          statusCode: 400,
          code: "INVALID_REQUEST",
          message: "Request body is invalid",
          details: {
            formErrors: flattened.formErrors,
            fieldErrors: flattened.fieldErrors,
          },
        }),
      );
      return;
    }

    request.body = parsed.data;
    next();
  };
}

export function validateQuery(schema: z.ZodType): RequestHandler {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request.query);

    if (!parsed.success) {
      const flattened = z.flattenError(parsed.error);
      next(
        new ApiError({
          statusCode: 400,
          code: "INVALID_REQUEST",
          message: "Query parameters are invalid",
          details: {
            formErrors: flattened.formErrors,
            fieldErrors: flattened.fieldErrors,
          },
        }),
      );
      return;
    }

    next();
  };
}

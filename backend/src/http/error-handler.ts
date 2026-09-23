import type { ErrorRequestHandler } from "express";
import { ApiError, type ApiErrorResponse } from "./api-error.js";

type HttpParserError = Error & {
  status?: number;
  type?: string;
};

function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  const parserError = error as HttpParserError;
  if (parserError?.type === "entity.parse.failed" && parserError.status === 400) {
    return new ApiError({
      statusCode: 400,
      code: "INVALID_REQUEST",
      message: "Request body contains invalid JSON",
      cause: error,
    });
  }

  if (parserError?.type === "entity.too.large" && parserError.status === 413) {
    return new ApiError({
      statusCode: 413,
      code: "REQUEST_TOO_LARGE",
      message: "Request body is too large",
      cause: error,
    });
  }

  return new ApiError({
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    cause: error,
  });
}

export const errorHandler: ErrorRequestHandler = (error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  const apiError = normalizeError(error);
  const logFields = { err: error, code: apiError.code, statusCode: apiError.statusCode };

  if (apiError.statusCode >= 500) {
    request.log.error(logFields, "Request failed");
  } else {
    request.log.info({ code: apiError.code, statusCode: apiError.statusCode }, "Request rejected");
  }

  const body: ApiErrorResponse = {
    requestId: request.requestId,
    code: apiError.code,
    message: apiError.message,
    ...(apiError.details ? { details: apiError.details } : {}),
  };

  if (apiError.retryAfterSeconds !== undefined) {
    response.setHeader("Retry-After", String(apiError.retryAfterSeconds));
  }

  response.status(apiError.statusCode).json(body);
};

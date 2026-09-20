import type { RequestHandler } from "express";
import { ApiError } from "../http/api-error.js";
import type { TokenService } from "./token-service.js";

export function requireAccessToken(tokenService: TokenService): RequestHandler {
  return async (request, _response, next) => {
    try {
      const authorization = request.get("Authorization");
      const match = authorization?.match(/^Bearer ([^\s]+)$/);

      if (!match) {
        throw new ApiError({
          statusCode: 401,
          code: "INVALID_TOKEN",
          message: "Bearer access token is required",
        });
      }

      request.auth = await tokenService.verifyAccessToken(match[1]);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function optionalAccessToken(tokenService: TokenService): RequestHandler {
  return async (request, _response, next) => {
    try {
      const authorization = request.get("Authorization");
      if (!authorization) {
        next();
        return;
      }
      const match = authorization.match(/^Bearer ([^\s]+)$/);
      if (!match) {
        throw new ApiError({
          statusCode: 401,
          code: "INVALID_TOKEN",
          message: "Authorization header is invalid",
        });
      }
      request.auth = await tokenService.verifyAccessToken(match[1]);
      next();
    } catch (error) {
      next(error);
    }
  };
}

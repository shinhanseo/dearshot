import type { IncomingMessage } from "node:http";
import type { RequestHandler } from "express";
import type { Logger } from "pino";
import { pinoHttp } from "pino-http";

type RequestWithId = IncomingMessage & {
  requestId: string;
};

function pathWithoutQuery(url: string | undefined): string {
  return url?.split("?", 1)[0] || "/";
}

export function createHttpLogger(logger: Logger): RequestHandler {
  return pinoHttp<RequestWithId>({
    logger,
    genReqId: (request) => (request as RequestWithId).requestId,
    customProps: (request) => ({ requestId: request.id }),
    serializers: {
      req: (request) => ({
        method: request.method,
        path: pathWithoutQuery(request.url),
        remoteAddress: request.remoteAddress,
      }),
      res: (response) => ({ statusCode: response.statusCode }),
    },
    customLogLevel: (_request, response, error) => {
      if (error || response.statusCode >= 500) return "error";
      if (response.statusCode >= 400) return "warn";
      return "info";
    },
  });
}

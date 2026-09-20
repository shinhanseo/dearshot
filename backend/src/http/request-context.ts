import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { z } from "zod";

export const REQUEST_ID_HEADER = "X-Request-ID";

type RequestContext = {
  requestId: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();
const uuidSchema = z.uuid();

export function resolveRequestId(incomingRequestId: string | undefined): string {
  return uuidSchema.safeParse(incomingRequestId).success ? incomingRequestId! : randomUUID();
}

export const requestContext: RequestHandler = (request, response, next) => {
  const requestId = resolveRequestId(request.get(REQUEST_ID_HEADER));
  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);

  requestContextStorage.run({ requestId }, next);
};

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

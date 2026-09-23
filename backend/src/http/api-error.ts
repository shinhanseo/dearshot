export type ApiErrorDetails = Record<string, unknown>;

type ApiErrorOptions = {
  statusCode: number;
  code: string;
  message: string;
  details?: ApiErrorDetails;
  retryAfterSeconds?: number;
  cause?: unknown;
};

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ApiErrorDetails;
  readonly retryAfterSeconds?: number;

  constructor({ statusCode, code, message, details, retryAfterSeconds, cause }: ApiErrorOptions) {
    super(message, { cause });
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type ApiErrorResponse = {
  requestId: string;
  code: string;
  message: string;
  details?: ApiErrorDetails;
};

import type { AccessPrincipal } from "../auth/token-service.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AccessPrincipal;
    }
  }
}

export {};

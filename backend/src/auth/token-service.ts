import { createHash, randomBytes, randomUUID } from "node:crypto";
import { errors as joseErrors, jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import type { AuthConfig } from "../config/environment.js";
import { ApiError } from "../http/api-error.js";

const accessClaimsSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  principalType: z.enum(["GUEST", "MEMBER"]),
  role: z.enum(["USER", "ADMIN"]),
  jti: z.uuid(),
});

export type AccessPrincipal = z.infer<typeof accessClaimsSchema>;

export type RefreshTokenMaterial = {
  plaintext: string;
  hash: string;
};

export type IssuedAccessToken = {
  token: string;
  expiresAt: Date;
};

export class TokenService {
  private readonly secret: Uint8Array;

  constructor(private readonly config: AuthConfig) {
    this.secret = new TextEncoder().encode(config.accessTokenSecret);
  }

  async issueAccessToken(
    principal: Omit<AccessPrincipal, "jti">,
    now = new Date(),
  ): Promise<IssuedAccessToken> {
    const expiresAt = new Date(now.getTime() + this.config.accessTokenTtlSeconds * 1_000);
    const token = await new SignJWT({
      sid: principal.sid,
      principalType: principal.principalType,
      role: principal.role,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(principal.sub)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setJti(randomUUID())
      .setIssuedAt(Math.floor(now.getTime() / 1_000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1_000))
      .sign(this.secret);

    return { token, expiresAt };
  }

  async verifyAccessToken(token: string, now = new Date()): Promise<AccessPrincipal> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ["HS256"],
        issuer: this.config.issuer,
        audience: this.config.audience,
        currentDate: now,
      });
      return accessClaimsSchema.parse(payload);
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) {
        throw new ApiError({
          statusCode: 401,
          code: "TOKEN_EXPIRED",
          message: "Access token has expired",
          cause: error,
        });
      }

      throw new ApiError({
        statusCode: 401,
        code: "INVALID_TOKEN",
        message: "Access token is invalid",
        cause: error,
      });
    }
  }

  createRefreshToken(): RefreshTokenMaterial {
    const plaintext = randomBytes(32).toString("base64url");
    return { plaintext, hash: this.hashRefreshToken(plaintext) };
  }

  hashRefreshToken(plaintext: string): string {
    return createHash("sha256").update(plaintext, "utf8").digest("hex");
  }
}

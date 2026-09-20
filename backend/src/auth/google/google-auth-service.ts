import { createHash } from "node:crypto";
import { ApiError } from "../../http/api-error.js";
import type { SocialIdentityAuthService } from "../social-identity-auth-service.js";
import type { GoogleIdentityVerifier } from "./google-identity-verifier.js";

export type GoogleAuthInput = {
  idToken: string;
  nonce: string;
  guestAccessToken?: string | null;
  device: {
    installationId: string;
    platform: "ANDROID";
    appVersion: string;
  };
};

export class GoogleAuthService {
  constructor(
    private readonly verifier: GoogleIdentityVerifier,
    private readonly socialIdentityAuth: SocialIdentityAuthService,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async authenticate(input: GoogleAuthInput) {
    const identity = await this.verifier.verify(input.idToken, input.nonce);
    if (identity.tokenExpiresAt <= this.clock()) {
      throw new ApiError({
        statusCode: 401,
        code: "INVALID_TOKEN",
        message: "Google ID token is invalid",
      });
    }

    return this.socialIdentityAuth.authenticate({
      identity: {
        provider: "GOOGLE",
        subject: identity.subject,
        displayName: identity.displayName,
        profileImageUrl: identity.profileImageUrl,
        locale: identity.locale,
      },
      guestAccessToken: input.guestAccessToken,
      device: input.device,
      replayProtection: {
        keyHash: createHash("sha256").update(input.nonce, "utf8").digest("hex"),
        expiresAt: identity.tokenExpiresAt,
      },
    });
  }
}

import { ApiError } from "../../http/api-error.js";
import type {
  GoogleIdentityVerifier,
  VerifiedGoogleIdentity,
} from "./google-identity-verifier.js";

export class FakeGoogleIdentityVerifier implements GoogleIdentityVerifier {
  constructor(private readonly identities: ReadonlyMap<string, VerifiedGoogleIdentity>) {}

  async verify(idToken: string, expectedNonce: string): Promise<VerifiedGoogleIdentity> {
    const identity = this.identities.get(idToken);
    if (!identity || identity.nonce !== expectedNonce || identity.tokenExpiresAt <= new Date()) {
      throw new ApiError({
        statusCode: 401,
        code: "INVALID_TOKEN",
        message: "Google ID token is invalid",
      });
    }
    return identity;
  }
}

import { ApiError } from "../../http/api-error.js";
import type {
  KakaoIdentityVerifier,
  VerifiedKakaoIdentity,
} from "./kakao-identity-verifier.js";

export class FakeKakaoIdentityVerifier implements KakaoIdentityVerifier {
  constructor(private readonly identities: ReadonlyMap<string, VerifiedKakaoIdentity>) {}

  async verify(accessToken: string): Promise<VerifiedKakaoIdentity> {
    const identity = this.identities.get(accessToken);
    if (!identity) {
      throw new ApiError({
        statusCode: 401,
        code: "INVALID_TOKEN",
        message: "Kakao access token is invalid",
      });
    }
    return identity;
  }
}

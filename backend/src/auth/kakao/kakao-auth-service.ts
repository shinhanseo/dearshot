import type { SocialIdentityAuthService } from "../social-identity-auth-service.js";
import type { KakaoIdentityVerifier } from "./kakao-identity-verifier.js";

export type KakaoAuthInput = {
  accessToken: string;
  guestAccessToken?: string | null;
  device: {
    installationId: string;
    platform: "ANDROID";
    appVersion: string;
  };
};

export class KakaoAuthService {
  constructor(
    private readonly verifier: KakaoIdentityVerifier,
    private readonly socialIdentityAuth: SocialIdentityAuthService,
  ) {}

  async authenticate(input: KakaoAuthInput) {
    const identity = await this.verifier.verify(input.accessToken);
    return this.socialIdentityAuth.authenticate({
      identity: {
        provider: "KAKAO",
        subject: identity.subject,
        displayName: identity.displayName,
        profileImageUrl: identity.profileImageUrl,
        locale: identity.locale,
      },
      guestAccessToken: input.guestAccessToken,
      device: input.device,
    });
  }
}

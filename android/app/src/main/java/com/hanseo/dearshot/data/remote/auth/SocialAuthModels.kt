package com.hanseo.dearshot.data.remote.auth

import kotlinx.serialization.Serializable

@Serializable
data class KakaoAuthRequest(
    val accessToken: String,
    val device: AuthDevice,
    val guestAccessToken: String? = null,
) {
    override fun toString(): String =
        "KakaoAuthRequest(tokens=[REDACTED])"
}

@Serializable
data class AuthDevice(
    val installationId: String,
    val platform: String,
    val appVersion: String,
)

@Serializable
data class MemberAuthResponse(
    val tokenType: String,
    val accessToken: String,
    val accessTokenExpiresAt: String,
    val refreshToken: String,
    val refreshTokenExpiresAt: String,
    val isNewUser: Boolean,
    val user: MemberUserResponse,
) {
    override fun toString(): String =
        "MemberAuthResponse(tokens=[REDACTED], isNewUser=$isNewUser)"
}

@Serializable
data class MemberUserResponse(
    val id: String,
    val displayName: String,
    val providers: List<String>,
    val preferences: UserPreferencesResponse,
    val profileImageUrl: String? = null,
    val counts: UserCountsResponse? = null,
)

@Serializable
data class UserPreferencesResponse(
    val locale: String,
    val defaultAspectRatio: String,
    val allowLocationContext: Boolean,
    val aiProcessingConsentVersion: String,
)

@Serializable
data class UserCountsResponse(
    val likedTemplates: Int = 0,
    val bookmarkedTemplates: Int = 0,
)

@Serializable
data class GoogleAuthRequest(
    val idToken: String,
    val nonce: String,
    val device: AuthDevice,
    val guestAccessToken: String? = null,
) {
    override fun toString(): String = "GoogleAuthRequest(credentials=[REDACTED])"
}

package com.hanseo.dearshot.data.remote.auth

import kotlinx.serialization.Serializable

@Serializable
data class GuestAuthRequest(
    val installationId: String,
    val locale: String,
    val appVersion: String,
)

@Serializable
data class GuestAuthResponse(
    val tokenType: String,
    val accessToken: String,
    val accessTokenExpiresAt: String,
    val refreshToken: String,
    val refreshTokenExpiresAt: String,
    val principal: GuestPrincipal,
    val limits: RemainingLimits,
)

@Serializable
data class GuestPrincipal(
    val id: String,
    val type: String,
)

@Serializable
data class RemainingLimits(
    val sceneAnalysesRemainingToday: Int,
    val photoFeedbacksRemainingToday: Int,
)
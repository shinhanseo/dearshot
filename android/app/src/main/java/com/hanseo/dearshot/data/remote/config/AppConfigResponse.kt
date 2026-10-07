package com.hanseo.dearshot.data.remote.config

import kotlinx.serialization.Serializable

@Serializable
data class AppConfigResponse(
    val minimumSupportedVersion: String,
    val latestVersion: String,
    val forceUpdate: Boolean,
    val maintenance: Boolean,
    val catalogVersion: String,
    val upload: UploadConfig,
    val guestLimits: GuestLimits,
    val legal: LegalConfig,
    val features: Map<String, Boolean>,
)

@Serializable
data class UploadConfig(
    val maxBytes: Long,
    val supportedContentTypes: List<String>,
    val recommendedLongEdgePx: Int,
)

@Serializable
data class GuestLimits(
    val sceneAnalysesPerDay: Int,
    val photoFeedbacksPerDay: Int,
)

@Serializable
data class LegalConfig(
    val privacyPolicyVersion: String,
    val privacyPolicyUrl: String,
    val termsVersion: String,
    val termsUrl: String,
)
package com.hanseo.dearshot.data.remote.template

import kotlinx.serialization.Serializable

@Serializable
data class TemplateDetailResponse(
    val id: String,
    val version: Int,
    val title: String,
    val summary: String,
    val sceneKeys: List<String>,
    val thumbnailUrl: String,
    val previewUrl: String,
    val supportedAspectRatios: List<String>,
    val guide: TemplateGuideResponse
)

@Serializable
data class TemplateGuideResponse(
    val type: String,
    val assetUrl: String,
    val coordinateSpace: String,
    val referenceWidth: Int,
    val referenceHeight: Int,
)
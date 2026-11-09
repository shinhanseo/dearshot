package com.hanseo.dearshot.data.remote.template

import kotlinx.serialization.Serializable

@Serializable
data class TemplateListResponse(
    val catalogVersion: String,
    val items: List<TemplateSummaryResponse>,
    val nextCursor: String?,
    val hasNext: Boolean,
)

@Serializable
data class TemplateSummaryResponse(
    val id: String,
    val version: Int,
    val title: String,
    val summary: String,
    val sceneKeys: List<String>,
    val thumbnailUrl: String,
    val previewUrl: String,
    val supportedAspectRatios: List<String>,
    val peopleCount: Int,
    val likeCount: Int,
    val liked: Boolean,
    val bookmarked: Boolean,
)
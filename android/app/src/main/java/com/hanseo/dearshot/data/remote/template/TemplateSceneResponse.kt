package com.hanseo.dearshot.data.remote.template

import kotlinx.serialization.Serializable

@Serializable
data class TemplateSceneResponse(
    val catalogVersion: String,
    val items: List<TemplateSceneItem>,
)

@Serializable
data class TemplateSceneItem(
    val key: String,
    val displayName: String,
    val templateCount: Int,
    val active: Boolean,
)

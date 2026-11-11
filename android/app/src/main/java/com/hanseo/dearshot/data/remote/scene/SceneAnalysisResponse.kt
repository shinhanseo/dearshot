package com.hanseo.dearshot.data.remote.scene

import kotlinx.serialization.Serializable

@Serializable
data class CreateSceneAnalysisResponse(
    val analysisId: String,
    val sceneRevision: Int,
    val status: String,
    val pollAfterMs: Long,
    val expiresAt: String,
)

@Serializable
data class SceneAnalysisStatusResponse(
    val analysisId: String,
    val sceneRevision: Int,
    val status: String,
    val pollAfterMs: Long?,
    val expiresAt: String,
    val result: SceneAnalysisResult?,
    val failureCode: String?,
    val retryable: Boolean?,
)

@Serializable
data class SceneAnalysisResult(
    val outcome: String,
    val scene: RecommendedScene? = null,
    val recommendation: SceneRecommendation? = null,
    val recommendations: List<SceneRecommendation> = emptyList(),
    val reasonCode: String? = null,
    val sceneCandidates: List<String> = emptyList(),
)

@Serializable
data class RecommendedScene(
    val sceneKey: String,
    val confidence: Float,
)

@Serializable
data class SceneRecommendation(
    val template: RecommendedTemplateRef,
    val reasonCode: String,
)

@Serializable
data class RecommendedTemplateRef(
    val id: String,
    val version: Int,
)
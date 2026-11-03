package com.hanseo.dearshot.data.remote.scene

import kotlinx.serialization.Serializable

@Serializable
data class SceneAnalysisRequest(
    val uploadId: String,
    val sceneRevision: Int,
    val capturedAt: String,
    val locale: String,
    val deviceAnalysis: DeviceAnalysisRequest,
)

@Serializable
data class DeviceAnalysisRequest(
    val sceneClassifier: SceneClassifierRequest,
    val objectDetector: ObjectDetectorRequest,
)

@Serializable
data class SceneClassifierRequest(
    val model: String,
    val modelVersion: String,
    val runtime: String,
    val candidates: List<SceneCandidateRequest>,
)

@Serializable
data class SceneCandidateRequest(
    val label: String,
    val confidence: Float,
)

@Serializable
data class ObjectDetectorRequest(
    val model: String,
    val modelVersion: String,
    val runtime: String,
    val objects: List<DetectedObjectRequest>,
)

@Serializable
data class DetectedObjectRequest(
    val label: String,
    val confidence: Float,
    val box: ObjectBoxRequest,
)

@Serializable
data class ObjectBoxRequest(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
)
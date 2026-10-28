package com.hanseo.dearshot.analysis.scene

data class SceneCandidate(
    val index: Int,
    val label: String,
    val confidence: Float
)

data class SceneClassification(
    val candidates: List<SceneCandidate>,
    val processingTimeMs: Double
)


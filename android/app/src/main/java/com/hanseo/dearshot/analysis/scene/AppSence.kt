package com.hanseo.dearshot.analysis.scene

enum class AppScene {
    WATERFRONT,
    CAFE,
    GREEN_SPACE,
    URBAN_STREET,
    UNKNOWN,
}

data class AppSceneScore(
    val scene: AppScene,
    val score: Float
)

data class AppSceneResult(
    val scene: AppScene,
    val scores: List<AppSceneScore>,
    val unmappedScore: Float,
    val omittedScore: Float
)


package com.hanseo.dearshot.analysis.recommendation

import com.hanseo.dearshot.analysis.scene.AppScene
import com.hanseo.dearshot.camera.motion.CameraMotionState
import com.hanseo.dearshot.camera.motion.CameraMotionStatus

data class RecommendationReady(
    val scene: AppScene,
    val decidedAtMs: Long,
)

/** FrameAnalyzer와 같은 단일 분석 스레드에서 사용한다. */
class RecommendationCoordinator(
    private val requiredSceneObservations: Int = 2,
    private val sceneResultTtlMs: Long = 1_500L,
    private val stabilityResultTtlMs: Long = 750L,
) {
    init {
        require(requiredSceneObservations >= 2)
        require(sceneResultTtlMs > 0)
        require(stabilityResultTtlMs > 0)
    }

    private var latestScene = AppScene.UNKNOWN
    private var latestSceneAtMs: Long? = null
    private var sceneObservationCount = 0
    private var triggered = false

    fun updateScene(scene: AppScene, analyzedAtMs: Long) {
        val previousTime = latestSceneAtMs
        val isContinuous = previousTime != null &&
            analyzedAtMs > previousTime &&
            analyzedAtMs - previousTime <= sceneResultTtlMs

        sceneObservationCount = when {
            scene == AppScene.UNKNOWN -> 0
            scene == latestScene && isContinuous ->
                (sceneObservationCount + 1).coerceAtMost(requiredSceneObservations)
            else -> 1
        }
        latestScene = scene
        latestSceneAtMs = analyzedAtMs
    }

    fun invalidateScene() {
        latestScene = AppScene.UNKNOWN
        latestSceneAtMs = null
        sceneObservationCount = 0
    }

    fun onScreenUnstable() {
        invalidateScene()
    }

    /** 센서 사용 불가·준비 중·움직임 상태에서는 추천을 보류한다. */
    fun evaluate(nowMs: Long, motion: CameraMotionState): RecommendationReady? {
        val measuredAt = motion.measuredAtNanos ?: return null
        if (motion.status != CameraMotionStatus.STABLE || measuredAt < 0L) return null
        return evaluate(
            nowMs = nowMs,
            isStable = true,
            stabilityAnalyzedAtMs = measuredAt / 1_000_000L,
        )
    }

    fun evaluate(
        nowMs: Long,
        isStable: Boolean,
        stabilityAnalyzedAtMs: Long,
    ): RecommendationReady? {
        if (triggered || !isStable) return null
        if (!isFresh(nowMs, stabilityAnalyzedAtMs, stabilityResultTtlMs)) return null

        val sceneTime = latestSceneAtMs ?: return null
        if (latestScene == AppScene.UNKNOWN) return null
        if (sceneObservationCount < requiredSceneObservations) return null
        if (!isFresh(nowMs, sceneTime, sceneResultTtlMs)) return null

        triggered = true
        return RecommendationReady(latestScene, nowMs)
    }

    fun reset() {
        triggered = false
        onScreenUnstable()
    }

    private fun isFresh(nowMs: Long, analyzedAtMs: Long, ttlMs: Long): Boolean =
        nowMs - analyzedAtMs in 0L..ttlMs
}

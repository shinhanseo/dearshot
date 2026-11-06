package com.hanseo.dearshot.analysis

import android.os.SystemClock
import android.util.Log
import androidx.annotation.WorkerThread
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.hanseo.dearshot.BuildConfig
import com.hanseo.dearshot.analysis.scene.SceneClassification
import java.io.Closeable
import java.util.Locale
import java.time.Instant
import com.hanseo.dearshot.analysis.recommendation.RecommendationSnapshot
import com.hanseo.dearshot.analysis.scene.AppSceneMapper
import com.hanseo.dearshot.analysis.recommendation.RecommendationCoordinator
import com.hanseo.dearshot.camera.motion.CameraMotionState
import com.hanseo.dearshot.analysis.detection.ObjectDetection

class FrameAnalyzer(
    private val analysisSession: CameraAnalysisSession,
    private val bitmapConverter: FrameBitmapConverter,
    private val debugFrameWriter: DebugFrameWriter,

    private val motionStateProvider: () -> CameraMotionState,

    // 분석 스레드에서 호출된다.
    private val onMotionChanged: (com.hanseo.dearshot.camera.motion.CameraMotionState) -> Unit = {},
    private val onSceneAnalyzed: (SceneClassification) -> Unit = {},
    private val onObjectsAnalyzed: (ObjectDetection?) -> Unit = {},
    private val onRecommendationSnapshot: (RecommendationSnapshot) -> Unit = {},
    private val onRecommendationSnapshotFailed: (Exception) -> Unit = {},
) : ImageAnalysis.Analyzer, Closeable {

    private var lastObjectsAnalyzedAt: Long? = null

    private var lastSceneAnalyzedAt: Long? = null

    private var lastProcessedAt: Long? = null

    private val sceneMapper = AppSceneMapper()

    private val recommendationCoordinator = RecommendationCoordinator()

    private var snapshotSaved = false
    private var closed = false

    /**
     * 새 프레임으로 추천 조건을 다시 판단한다.
     *
     * 반드시 analyze()와 같은 단일 분석 실행기에서 호출한다.
     */
    @WorkerThread
    fun resetRecommendation() {
        if (closed) return

        // 이미 추천을 시작했다는 잠금과 이전 장소 판단을 초기화한다.
        recommendationCoordinator.reset()

        // 다음 프레임에서 장소·객체 분석을 바로 다시 수행한다.
        lastSceneAnalyzedAt = null
        lastObjectsAnalyzedAt = null
        lastProcessedAt = null

        if (BuildConfig.DEBUG) {
            Log.d(
                TAG,
                "Recommendation reset: waiting for a fresh scene",
            )
        }
    }

    @WorkerThread
    override fun analyze(image: ImageProxy) {
        try {
            if (closed) return

            val now = SystemClock.elapsedRealtime()
            val previous = lastProcessedAt

            if (
                previous != null &&
                now - previous < FRAME_INTERVAL_MS
            ) {
                return
            }

            lastProcessedAt = now

            val frameSelectedAt = Instant.now().toString()
            val bitmap = bitmapConverter.convert(image)

            try {
                saveDebugFrameIfNeeded(bitmap)

                val previousObjectsTime = lastObjectsAnalyzedAt
                if (previousObjectsTime == null || now - previousObjectsTime >= OBJECT_INTERVAL_MS) {
                    lastObjectsAnalyzedAt = now
                    val detection = try {
                        analysisSession.detect(bitmap)
                    } catch (exception: Exception) {
                        Log.e(TAG, "Failed to analyze objects", exception)
                        null
                    }
                    // null은 분석 실패, 빈 목록은 객체 없음이다.
                    onObjectsAnalyzed(detection)
                    if (BuildConfig.DEBUG && detection != null) {
                        Log.d(TAG, "Objects: count=${detection.objects.size}, processing=${detection.processingTimeMs}ms")
                    }
                }

                // 장소 분석은 별도로 약 1초마다 실행한다.
                val previousSceneTime = lastSceneAnalyzedAt

                val shouldAnalyzeScene =
                    previousSceneTime == null ||
                            now - previousSceneTime >= SCENE_INTERVAL_MS

                if (shouldAnalyzeScene) {
                    lastSceneAnalyzedAt = now

                    val result = analysisSession.classify(bitmap = bitmap, topK = 5)

                    logResult(result)

                    val appScene = sceneMapper.map(result)
                    recommendationCoordinator.updateScene(
                        scene = appScene.scene,
                        analyzedAtMs = now,
                    )

                    if (BuildConfig.DEBUG) {
                        val scoreText = appScene.scores.joinToString(" | ") {
                            String.format(
                                Locale.US,
                                "%s=%.1f%%",
                                it.scene.name,
                                it.score * 100f,
                            )
                        }

                        Log.d(
                            TAG,
                            "AppScene: ${appScene.scene}, $scoreText",
                        )
                    }

                    onSceneAnalyzed(result)
                }

                // 모델 처리 중 움직였을 수 있으므로 최신 센서 상태를 읽는다.
                val motion = motionStateProvider()
                onMotionChanged(motion)
                if (motion.averageAngularSpeed >= 0.5 || motion.accumulatedRotation >= 0.2) {
                    recommendationCoordinator.onScreenUnstable()
                }
                if (BuildConfig.DEBUG) {
                    Log.d(
                        TAG,
                        String.format(
                            Locale.US,
                            "Motion: status=%s, speed=%.4f rad/s, rotation=%.4f rad, window=%dms",
                            motion.status,
                            motion.averageAngularSpeed,
                            motion.accumulatedRotation,
                            motion.windowDurationMs,
                        ),
                    )
                }
                val ready = recommendationCoordinator.evaluate(
                    nowMs = SystemClock.elapsedRealtime(),
                    motion = motion,
                )
                if (ready != null) {
                    Log.d(
                        TAG,
                        "Recommendation ready: scene=${ready.scene}, " +
                            "time=${ready.decidedAtMs}",
                    )
                    val snapshot = try {
                        analysisSession.createSnapshot(
                            bitmap = bitmap,
                            capturedAt = frameSelectedAt,
                            expectedScene = ready.scene,
                        )
                    } catch (exception: Exception) {
                        Log.e(TAG, "Failed to prepare recommendation snapshot", exception)
                        onRecommendationSnapshotFailed(exception)
                        null
                    }
                    if (snapshot != null) {
                        Log.d(
                            TAG,
                            "Recommendation snapshot ready: id=${snapshot.id}, " +
                                "scene=${snapshot.scene}, size=${snapshot.imageWidth}x${snapshot.imageHeight}, " +
                                "bytes=${snapshot.jpegBytes.size}, objects=${snapshot.objectDetection.objects.size}",
                        )
                        onRecommendationSnapshot(snapshot)
                    }
                }
            } finally {
                bitmap.recycle()
            }
        } catch (exception: Exception) {
            // 프레임 변환이나 장소 분석이 실패하면 이전 판단을 무효화한다.
            recommendationCoordinator.onScreenUnstable()
            Log.e(
                TAG,
                "Failed to analyze camera frame",
                exception,
            )
        } finally {
            image.close()
        }
    }

    private fun saveDebugFrameIfNeeded(
        bitmap: android.graphics.Bitmap,
    ) {
        if (!BuildConfig.DEBUG || snapshotSaved) return

        // 디버그 사진 저장 실패가 모델 분석까지 막지 않게 한다.
        try {
            val file = debugFrameWriter.write(bitmap)
            snapshotSaved = true

            Log.d(
                TAG,
                "Snapshot saved: ${file.absolutePath}, " +
                        "size=${bitmap.width}x${bitmap.height}",
            )
        } catch (exception: Exception) {
            Log.w(
                TAG,
                "Failed to save debug frame",
                exception,
            )
        }
    }

    private fun logResult(
        result: SceneClassification,
    ) {
        if (!BuildConfig.DEBUG) return

        val candidates = result.candidates.joinToString(
            separator = " | ",
        ) { candidate ->
            String.format(
                Locale.US,
                "%s=%.1f%%",
                candidate.label,
                candidate.confidence * 100f,
            )
        }

        val processingTime = String.format(
            Locale.US,
            "%.1f",
            result.processingTimeMs,
        )

        Log.d(
            TAG,
            "Places365: $candidates, " +
                    "processing=${processingTime}ms",
        )
    }

    /**
     * analyze()와 같은 단일 분석 실행기에서 호출한다.
     * 진행 중인 분석이 끝난 뒤 모델을 닫기 위함이다.
     */
    @WorkerThread
    override fun close() {
        if (closed) return

        closed = true

        try {
            analysisSession.close()
        } finally {
            recommendationCoordinator.reset()
        }
    }

    private companion object {
        const val TAG = "FrameAnalyzer"

        const val FRAME_INTERVAL_MS = 250L
        const val SCENE_INTERVAL_MS = 1_000L
        const val OBJECT_INTERVAL_MS = 500L
    }
}
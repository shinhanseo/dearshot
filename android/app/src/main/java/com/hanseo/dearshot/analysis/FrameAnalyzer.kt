package com.hanseo.dearshot.analysis

import android.content.Context
import android.os.SystemClock
import android.util.Log
import androidx.annotation.WorkerThread
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.hanseo.dearshot.BuildConfig
import com.hanseo.dearshot.analysis.scene.Places365Classifier
import com.hanseo.dearshot.analysis.scene.SceneClassification
import java.io.Closeable
import java.util.Locale

class FrameAnalyzer(
    context: Context,
    private val bitmapConverter: FrameBitmapConverter,
    private val debugFrameWriter: DebugFrameWriter,

    // 분석 스레드에서 호출된다.
    private val onSceneAnalyzed: (SceneClassification) -> Unit = {},
) : ImageAnalysis.Analyzer, Closeable {

    private val appContext = context.applicationContext

    // 첫 분석 시 분석 스레드에서 생성한다.
    private var classifier: Places365Classifier? = null

    private val stabilityDetector = FrameStabilityDetector()

    private var lastSceneAnalyzedAt: Long? = null

    private var lastProcessedAt: Long? = null
    private var snapshotSaved = false
    private var closed = false

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

            val bitmap = bitmapConverter.convert(image)

            try {
                // 화면 변화는 약 250ms마다 확인한다.
                val stability = stabilityDetector.analyze(
                    bitmap = bitmap,
                    capturedAtMs = now,
                )

                if (BuildConfig.DEBUG) {
                    val differenceText = stability.difference?.let {
                        String.format(Locale.US, "%.4f", it)
                    } ?: "first"

                    Log.d(
                        TAG,
                        "Stability: difference=$differenceText, " +
                                "duration=${stability.stableDurationMs}ms, " +
                                "stable=${stability.isStable}",
                    )
                }

                saveDebugFrameIfNeeded(bitmap)

                // 장소 분석은 별도로 약 1초마다 실행한다.
                val previousSceneTime = lastSceneAnalyzedAt

                val shouldAnalyzeScene =
                    previousSceneTime == null ||
                            now - previousSceneTime >= SCENE_INTERVAL_MS

                if (shouldAnalyzeScene) {
                    lastSceneAnalyzedAt = now

                    val sceneClassifier = classifier
                        ?: Places365Classifier(appContext).also {
                            classifier = it
                            it.logModelInfo()
                        }

                    val result = sceneClassifier.classify(
                        bitmap = bitmap,
                        topK = 5,
                    )

                    logResult(result)
                    onSceneAnalyzed(result)
                }
            } finally {
                bitmap.recycle()
            }
        } catch (exception: Exception) {
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
            classifier?.close()
        } finally {
            classifier = null
        }
    }

    private companion object {
        const val TAG = "FrameAnalyzer"

        const val FRAME_INTERVAL_MS = 250L
        const val SCENE_INTERVAL_MS = 1_000L
    }
}
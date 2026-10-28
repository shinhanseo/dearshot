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
                now - previous < PROCESS_INTERVAL_MS
            ) {
                return
            }

            lastProcessedAt = now

            val sceneClassifier = classifier
                ?: Places365Classifier(appContext).also {
                    classifier = it
                    it.logModelInfo()
                }

            // 기존 변환기의 크롭·회전 처리를 그대로 사용한다.
            val bitmap = bitmapConverter.convert(image)

            try {
                saveDebugFrameIfNeeded(bitmap)

                val result = sceneClassifier.classify(
                    bitmap = bitmap,
                    topK = 5,
                )

                logResult(result)

                // Bitmap 대신 분석 결과만 외부로 전달한다.
                onSceneAnalyzed(result)
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
            // 건너뛴 프레임이나 실패한 프레임도 반드시 반환한다.
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

        // 지금은 실제 장소 결과를 확인하기 위한 초기 실행 간격.
        const val PROCESS_INTERVAL_MS = 1_000L
    }
}
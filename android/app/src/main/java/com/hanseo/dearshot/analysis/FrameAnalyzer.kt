package com.hanseo.dearshot.analysis

import android.os.SystemClock
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy

class FrameAnalyzer : ImageAnalysis.Analyzer {
    private var lastProcessedAt: Long? = null

    override fun analyze(image: ImageProxy) {
        try {
            val now = SystemClock.elapsedRealtime()
            val previous = lastProcessedAt

            // 1초에 한 번 프레임을 확인한다.
            if ( previous != null && now - previous < PROCESS_INTERVAL_MS ) {
                return
            }

            lastProcessedAt = now

            val crop = image.cropRect

            Log.d(
                TAG,
                "frame=${image.width}x${image.height}, " +
                        "rotation=${image.imageInfo.rotationDegrees}, " +
                        "crop=[${crop.left},${crop.top}," +
                        "${crop.right},${crop.bottom}], " +
                        "format=${image.format}, " +
                        "thread=${Thread.currentThread().name}",
            )
        } catch (exception: Exception) {
            Log.e(
                TAG,
                "Failed to process camera frame",
                exception,
            )
        } finally {
            // 중간에 return하거나 오류가 발생해도 반드시 반환한다.
            image.close()
        }
    }

    private companion object {
        const val TAG = "FrameAnalyzer"
        const val PROCESS_INTERVAL_MS = 1_000L
    }
}
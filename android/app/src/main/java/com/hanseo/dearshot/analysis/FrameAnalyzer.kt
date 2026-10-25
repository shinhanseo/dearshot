package com.hanseo.dearshot.analysis

import android.os.SystemClock
import android.util.Log
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import com.hanseo.dearshot.BuildConfig

class FrameAnalyzer(
    private val bitmapConverter: FrameBitmapConverter,
    private val debugFrameWriter: DebugFrameWriter,
) : ImageAnalysis.Analyzer {

    private var lastProcessedAt: Long? = null

    // Analyzer가 새로 생성될 때마다 한 번 저장한다.
    private var snapshotSaved = false

    override fun analyze(image: ImageProxy) {
        try {
            val now = SystemClock.elapsedRealtime()
            val previous = lastProcessedAt

            if (
                previous != null &&
                now - previous < PROCESS_INTERVAL_MS
            ) {
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

            if (BuildConfig.DEBUG && !snapshotSaved) {
                val bitmap = bitmapConverter.convert(image)

                try {
                    val file = debugFrameWriter.write(bitmap)

                    snapshotSaved = true

                    Log.d(
                        TAG,
                        "Snapshot saved: ${file.absolutePath}, " +
                                "size=${bitmap.width}x${bitmap.height}",
                    )
                } finally {
                    bitmap.recycle()
                }
            }
        } catch (exception: Exception) {
            Log.e(
                TAG,
                "Failed to process camera frame",
                exception,
            )
        } finally {
            image.close()
        }
    }

    private companion object {
        const val TAG = "FrameAnalyzer"
        const val PROCESS_INTERVAL_MS = 1_000L
    }
}
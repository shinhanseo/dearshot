package com.hanseo.dearshot.analysis

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect

data class FrameStability(
    // 첫 프레임은 비교 대상이 없으므로 null.
    val difference: Float?,
    val stableDurationMs: Long,
    val isStable: Boolean,
)

/**
 * 같은 분석 스레드에서 사용한다.
 *
 * 입력 Bitmap의 회전과 크롭은 이미 처리되어 있어야 한다.
 * 전달받은 원본 Bitmap은 수정하거나 recycle하지 않는다.
 */
class FrameStabilityDetector(
    private val differenceThreshold: Float = 0.025f,
    private val requiredStableDurationMs: Long = 1_000L,
    private val maximumFrameGapMs: Long = 750L,
) {
    init {
        require(differenceThreshold in 0f..1f)
        require(requiredStableDurationMs > 0)
        require(maximumFrameGapMs > 0)
    }

    private var previousLuminance: FloatArray? = null
    private var previousTimestampMs: Long? = null

    private var stableSinceMs: Long? = null

    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)

    fun analyze(
        bitmap: Bitmap,
        capturedAtMs: Long,
    ): FrameStability {
        check(!bitmap.isRecycled)
        require(bitmap.config != Bitmap.Config.HARDWARE) {
            "A software Bitmap is required"
        }

        val currentLuminance = createLuminance(bitmap)

        val previous = previousLuminance
        val previousTime = previousTimestampMs

        previousLuminance = currentLuminance
        previousTimestampMs = capturedAtMs

        // 첫 프레임, 시간 역전, 긴 분석 중단 이후에는
        // 이전 프레임과 이어지는 것으로 판단하지 않는다.
        if (
            previous == null ||
            previousTime == null ||
            capturedAtMs <= previousTime ||
            capturedAtMs - previousTime > maximumFrameGapMs
        ) {
            stableSinceMs = null

            return FrameStability(
                difference = null,
                stableDurationMs = 0L,
                isStable = false,
            )
        }

        var totalDifference = 0f

        for (index in currentLuminance.indices) {
            totalDifference += kotlin.math.abs(
                currentLuminance[index] - previous[index]
            )
        }

        val difference =
            totalDifference / currentLuminance.size

        if (difference > differenceThreshold) {
            stableSinceMs = null

            return FrameStability(
                difference = difference,
                stableDurationMs = 0L,
                isStable = false,
            )
        }

        val stableSince = stableSinceMs
            ?: previousTime.also {
                stableSinceMs = it
            }

        val duration = capturedAtMs - stableSince

        return FrameStability(
            difference = difference,
            stableDurationMs = duration,
            isStable = duration >= requiredStableDurationMs,
        )
    }

    fun reset() {
        previousLuminance = null
        previousTimestampMs = null
        stableSinceMs = null
    }

    private fun createLuminance(
        bitmap: Bitmap,
    ): FloatArray {
        val smallBitmap = Bitmap.createBitmap(
            SAMPLE_SIZE,
            SAMPLE_SIZE,
            Bitmap.Config.ARGB_8888,
        )

        try {
            val canvas = Canvas(smallBitmap)

            canvas.drawBitmap(
                bitmap,
                null,
                Rect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE),
                paint,
            )

            val pixels = IntArray(SAMPLE_SIZE * SAMPLE_SIZE)

            smallBitmap.getPixels(
                pixels,
                0,
                SAMPLE_SIZE,
                0,
                0,
                SAMPLE_SIZE,
                SAMPLE_SIZE,
            )

            return FloatArray(pixels.size) { index ->
                val pixel = pixels[index]

                val red = (pixel shr 16) and 0xFF
                val green = (pixel shr 8) and 0xFF
                val blue = pixel and 0xFF

                // RGB를 밝기로 바꾸고 0~1 범위로 정규화.
                (
                        0.299f * red +
                                0.587f * green +
                                0.114f * blue
                        ) / 255f
            }
        } finally {
            smallBitmap.recycle()
        }
    }

    private companion object {
        const val SAMPLE_SIZE = 32
    }
}
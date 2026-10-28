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
    val rawDifference: Float? = null,
    val hasLargeMovement: Boolean = false,
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
    private val maximumBrightnessShift: Float = 0.15f,
    private val largeMovementThreshold: Float = 0.10f,
) {
    init {
        require(differenceThreshold in 0f..1f)
        require(requiredStableDurationMs > 0)
        require(maximumFrameGapMs > 0)
        require(maximumBrightnessShift in 0f..1f)
        require(largeMovementThreshold > differenceThreshold && largeMovementThreshold <= 1f)
    }

    private var previousLuminance: FloatArray? = null
    private var previousTimestampMs: Long? = null

    private data class Sample(
        val startedAtMs: Long,
        val isQuiet: Boolean,
        val reference: FloatArray,
    )
    private val samples = ArrayDeque<Sample>()

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
            samples.clear()

            return FrameStability(
                difference = null,
                stableDurationMs = 0L,
                isStable = false,
            )
        }

        val rawDifference = meanDifference(currentLuminance, previous)
        val brightnessShift = currentLuminance.average().toFloat() -
            previous.average().toFloat()

        // 자동 노출처럼 화면 전체에 공통으로 더해진 밝기 변화만 보정한다.
        // 최근 비교 구간의 시작 프레임과도 비교해 누적된 큰 이동을 확인한다.
        if (samples.size == WINDOW_SIZE) samples.removeFirst()
        val reference = samples.firstOrNull()?.reference ?: previous
        val referenceShift = currentLuminance.average().toFloat() -
            reference.average().toFloat()
        val difference = maxOf(
            meanDifference(currentLuminance, previous, brightnessShift),
            meanDifference(currentLuminance, reference, referenceShift),
        )

        if (
            difference > largeMovementThreshold ||
            kotlin.math.abs(brightnessShift) > maximumBrightnessShift ||
            kotlin.math.abs(referenceShift) > maximumBrightnessShift
        ) {
            samples.clear()
            return FrameStability(
                difference = difference,
                stableDurationMs = 0L,
                isStable = false,
                rawDifference = rawDifference,
                hasLargeMovement = true,
            )
        }

        samples.addLast(
            Sample(
                startedAtMs = previousTime,
                isQuiet = meanDifference(currentLuminance, previous, brightnessShift) <= differenceThreshold,
                reference = previous,
            )
        )
        val duration = capturedAtMs - samples.first().startedAtMs
        val stable = samples.size == WINDOW_SIZE &&
            samples.count { it.isQuiet } >= REQUIRED_QUIET_SAMPLES &&
            duration >= requiredStableDurationMs

        return FrameStability(
            difference = difference,
            stableDurationMs = duration,
            isStable = stable,
            rawDifference = rawDifference,
        )
    }

    fun reset() {
        previousLuminance = null
        previousTimestampMs = null
        samples.clear()
    }

    private fun meanDifference(
        current: FloatArray,
        previous: FloatArray,
        brightnessShift: Float = 0f,
    ): Float {
        var total = 0f
        for (index in current.indices) {
            total += kotlin.math.abs(current[index] - previous[index] - brightnessShift)
        }
        return total / current.size
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
        const val WINDOW_SIZE = 4
        const val REQUIRED_QUIET_SAMPLES = 3
    }
}
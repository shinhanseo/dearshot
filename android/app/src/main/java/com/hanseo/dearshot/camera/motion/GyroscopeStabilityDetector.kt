package com.hanseo.dearshot.camera.motion

import kotlin.math.sqrt

/**
 * Android 센서 API와 독립적인 계산 클래스.
 *
 * 같은 센서 수신 스레드에서만 사용한다.
 * 전달하는 시각은 SensorEvent.timestamp 기준이다.
 */
class GyroscopeStabilityDetector(
    private val windowDurationNanos: Long = 800_000_000L,
    private val maximumSampleGapNanos: Long = 250_000_000L,

    // 아래 기준들은 초기값이며 실기기 측정 후 조정한다.
    private val quietAngularSpeed: Double = 0.08,
    private val largeAngularSpeed: Double = 0.5,
    private val maximumAccumulatedRotation: Double = 0.04,
    private val requiredQuietFraction: Double = 0.8,
) {
    init {
        require(windowDurationNanos > 0)
        require(maximumSampleGapNanos > 0)
        require(quietAngularSpeed > 0.0)
        require(largeAngularSpeed > quietAngularSpeed)
        require(maximumAccumulatedRotation > 0.0)
        require(requiredQuietFraction in 0.0..1.0)
    }

    private data class Interval(
        val startedAtNanos: Long,
        val endedAtNanos: Long,
        val angularSpeed: Double,
    )

    private val intervals = ArrayDeque<Interval>()

    private var previousTimestampNanos: Long? = null
    private var previousAngularSpeed: Double? = null

    fun update(
        x: Float,
        y: Float,
        z: Float,
        timestampNanos: Long,
    ): CameraMotionState {
        if (
            timestampNanos < 0L ||
            !x.isFinite() ||
            !y.isFinite() ||
            !z.isFinite()
        ) {
            reset()

            return CameraMotionState(
                status = CameraMotionStatus.UNAVAILABLE,
            )
        }

        val xd = x.toDouble()
        val yd = y.toDouble()
        val zd = z.toDouble()

        val angularSpeed = sqrt(
            xd * xd + yd * yd + zd * zd
        )

        val previousTime = previousTimestampNanos
        val previousSpeed = previousAngularSpeed

        previousTimestampNanos = timestampNanos
        previousAngularSpeed = angularSpeed

        // 큰 회전이 감지되면 즉시 안정 기록을 비운다.
        if (angularSpeed >= largeAngularSpeed) {
            intervals.clear()

            return CameraMotionState(
                status = CameraMotionStatus.MOVING,
                measuredAtNanos = timestampNanos,
                averageAngularSpeed = angularSpeed,
            )
        }

        if (previousTime == null || previousSpeed == null) {
            return warmingUp(timestampNanos)
        }

        val elapsed = timestampNanos - previousTime

        if (
            elapsed <= 0L ||
            elapsed > maximumSampleGapNanos
        ) {
            intervals.clear()
            return warmingUp(timestampNanos)
        }

        intervals.addLast(
            Interval(
                startedAtNanos = previousTime,
                endedAtNanos = timestampNanos,
                angularSpeed = maxOf(
                    previousSpeed,
                    angularSpeed,
                ),
            )
        )

        val windowStart = timestampNanos - windowDurationNanos

        while (
            intervals.isNotEmpty() &&
            intervals.first().endedAtNanos <= windowStart
        ) {
            intervals.removeFirst()
        }

        var observedNanos = 0L
        var quietNanos = 0L
        var accumulatedRotation = 0.0

        for (interval in intervals) {
            val start = maxOf(
                interval.startedAtNanos,
                windowStart,
            )

            val durationNanos =
                interval.endedAtNanos - start

            if (durationNanos <= 0L) continue

            observedNanos += durationNanos

            if (interval.angularSpeed <= quietAngularSpeed) {
                quietNanos += durationNanos
            }

            val durationSeconds =
                durationNanos / 1_000_000_000.0

            accumulatedRotation +=
                interval.angularSpeed * durationSeconds
        }

        val averageSpeed = if (observedNanos > 0L) {
            accumulatedRotation /
                    (observedNanos / 1_000_000_000.0)
        } else {
            0.0
        }

        val hasEnoughHistory =
            observedNanos >= windowDurationNanos

        val quietFraction = if (observedNanos > 0L) {
            quietNanos.toDouble() / observedNanos
        } else {
            0.0
        }

        val status = when {
            !hasEnoughHistory -> CameraMotionStatus.WARMING_UP

            quietFraction >= requiredQuietFraction &&
                    accumulatedRotation <= maximumAccumulatedRotation -> {
                CameraMotionStatus.STABLE
            }

            else -> CameraMotionStatus.MOVING
        }

        return CameraMotionState(
            status = status,
            measuredAtNanos = timestampNanos,
            averageAngularSpeed = averageSpeed,
            accumulatedRotation = accumulatedRotation,
            windowDurationMs = observedNanos / 1_000_000L,
        )
    }

    fun reset() {
        intervals.clear()
        previousTimestampNanos = null
        previousAngularSpeed = null
    }

    private fun warmingUp(
        timestampNanos: Long,
    ): CameraMotionState {
        return CameraMotionState(
            status = CameraMotionStatus.WARMING_UP,
            measuredAtNanos = timestampNanos,
        )
    }
}
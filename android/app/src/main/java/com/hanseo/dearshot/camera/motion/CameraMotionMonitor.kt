package com.hanseo.dearshot.camera.motion

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.MainThread
import java.util.concurrent.atomic.AtomicReference

/**
 * 센서 등록·해제는 메인 스레드에서 처리한다.
 * 최신 상태는 다른 스레드에서도 읽을 수 있다.
 */
class CameraMotionMonitor(
    context: Context,
) {
    private val sensorManager =
        context.applicationContext
            .getSystemService(Context.SENSOR_SERVICE)
                as SensorManager

    private val gyroscope =
        sensorManager.getDefaultSensor(
            Sensor.TYPE_GYROSCOPE
        )

    private val mainHandler = Handler(
        Looper.getMainLooper()
    )

    private val detector = GyroscopeStabilityDetector()

    private val latestState = AtomicReference(
        CameraMotionState(
            status = CameraMotionStatus.UNAVAILABLE,
        )
    )

    private var listener: SensorEventListener? = null

    private var generation = 0L

    // 다른 스레드에서 상태를 읽을 때도 보이도록 한다.
    @Volatile
    private var startedAtNanos: Long? = null

    @MainThread
    fun start() {
        checkMainThread()

        // 이미 등록되어 있다면 중복 등록하지 않는다.
        if (listener != null) return

        detector.reset()

        val sensor = gyroscope

        if (sensor == null) {
            startedAtNanos = null
            latestState.set(unavailable())
            return
        }

        generation += 1
        val currentGeneration = generation

        latestState.set(
            CameraMotionState(
                status = CameraMotionStatus.WARMING_UP,
            )
        )

        startedAtNanos = SystemClock.elapsedRealtimeNanos()

        val newListener = object : SensorEventListener {
            override fun onSensorChanged(
                event: SensorEvent,
            ) {
                // 중지하거나 다시 시작하기 전의 이벤트는 무시한다.
                if (currentGeneration != generation) return

                val state = detector.update(
                    x = event.values[0],
                    y = event.values[1],
                    z = event.values[2],
                    timestampNanos = event.timestamp,
                )

                latestState.set(state)
            }

            override fun onAccuracyChanged(
                sensor: Sensor?,
                accuracy: Int,
            ) = Unit
        }

        val registered = sensorManager.registerListener(
            newListener,
            sensor,
            SAMPLING_PERIOD_US,
            mainHandler,
        )

        if (registered) {
            listener = newListener
        } else {
            generation += 1
            startedAtNanos = null
            latestState.set(unavailable())
        }
    }

    /**
     * FrameAnalyzer 같은 분석 스레드에서도 호출할 수 있다.
     *
     * 마지막 센서 결과가 오래됐다면 STABLE을 그대로 반환하지 않는다.
     */
    fun currentState(): CameraMotionState {
        val state = latestState.get()
        val now = SystemClock.elapsedRealtimeNanos()

        val measuredAt = state.measuredAtNanos

        if (measuredAt != null) {
            val age = now - measuredAt

            if (age < 0L || age > SENSOR_TIMEOUT_NANOS) {
                return unavailable()
            }

            return state
        }

        val startedAt = startedAtNanos

        // 등록은 됐지만 이벤트가 오지 않는 경우도 처리한다.
        if (
            state.status == CameraMotionStatus.WARMING_UP &&
            startedAt != null &&
            now - startedAt > STARTUP_TIMEOUT_NANOS
        ) {
            return unavailable()
        }

        return state
    }

    @MainThread
    fun stop() {
        checkMainThread()

        // 이미 대기 중인 이전 이벤트를 무효화한다.
        generation += 1

        listener?.let {
            sensorManager.unregisterListener(it)
        }

        listener = null
        startedAtNanos = null

        detector.reset()
        latestState.set(unavailable())
    }

    private fun unavailable(): CameraMotionState {
        return CameraMotionState(
            status = CameraMotionStatus.UNAVAILABLE,
        )
    }

    private fun checkMainThread() {
        check(Looper.myLooper() == Looper.getMainLooper()) {
            "CameraMotionMonitor start/stop must run on the main thread"
        }
    }

    private companion object {
        // 약 50Hz를 요청한다. 실제 수신 간격은 기기마다 다를 수 있다.
        const val SAMPLING_PERIOD_US = 20_000

        const val SENSOR_TIMEOUT_NANOS = 500_000_000L

        const val STARTUP_TIMEOUT_NANOS = 1_000_000_000L
    }
}
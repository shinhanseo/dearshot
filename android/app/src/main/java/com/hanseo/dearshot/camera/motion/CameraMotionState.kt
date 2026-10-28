package com.hanseo.dearshot.camera.motion

enum class CameraMotionStatus {
    WARMING_UP,
    MOVING,
    STABLE,
    UNAVAILABLE,
}

data class CameraMotionState(
    val status: CameraMotionStatus,

    // 마지막 센서 이벤트의 시각.
    val measuredAtNanos: Long? = null,

    // 최근 구간의 평균 회전 속도. 단위: rad/s.
    val averageAngularSpeed: Double = 0.0,

    // 최근 구간에서 움직인 총 회전량의 근사치. 단위: rad.
    val accumulatedRotation: Double = 0.0,

    val windowDurationMs: Long = 0L,
)
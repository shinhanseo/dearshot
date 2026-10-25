package com.hanseo.dearshot.camera

import androidx.camera.core.CameraSelector

enum class CameraLens {
    BACK,
    FRONT;

    fun toCameraSelector(): CameraSelector {
        return when (this) {
            BACK -> CameraSelector.DEFAULT_BACK_CAMERA
            FRONT -> CameraSelector.DEFAULT_FRONT_CAMERA
        }
    }

    fun opposite(): CameraLens {
        return when (this) {
            BACK -> FRONT
            FRONT -> BACK
        }
    }
}


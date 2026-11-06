package com.hanseo.dearshot.ui.camera

import com.hanseo.dearshot.analysis.scene.AppScene
import com.hanseo.dearshot.camera.motion.CameraMotionStatus

sealed interface CameraExplorationUiState {

    data object Preparing : CameraExplorationUiState

    data object Searching : CameraExplorationUiState

    data class PlaceFound(
        val scene: AppScene,
    ) : CameraExplorationUiState

    data class Holding(
        val scene: AppScene,
    ) : CameraExplorationUiState

    data object SensorUnavailable : CameraExplorationUiState
}

fun resolveCameraExplorationState(
    isCameraReady: Boolean,
    scene: AppScene,
    motionStatus: CameraMotionStatus,
): CameraExplorationUiState {
    return when {
        !isCameraReady -> {
            CameraExplorationUiState.Preparing
        }

        motionStatus == CameraMotionStatus.UNAVAILABLE -> {
            CameraExplorationUiState.SensorUnavailable
        }

        scene == AppScene.UNKNOWN -> {
            CameraExplorationUiState.Searching
        }

        motionStatus == CameraMotionStatus.STABLE -> {
            CameraExplorationUiState.Holding(
                scene = scene,
            )
        }

        else -> {
            CameraExplorationUiState.PlaceFound(
                scene = scene,
            )
        }
    }
}
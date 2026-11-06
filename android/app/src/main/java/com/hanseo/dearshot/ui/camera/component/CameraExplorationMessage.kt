package com.hanseo.dearshot.ui.camera.component

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.hanseo.dearshot.R
import com.hanseo.dearshot.analysis.scene.AppScene
import com.hanseo.dearshot.ui.camera.CameraExplorationUiState

@Composable
fun cameraExplorationMessage(
    state: CameraExplorationUiState,
): String {
    return when (state) {
        CameraExplorationUiState.Preparing -> {
            stringResource(
                R.string.camera_exploration_preparing,
            )
        }

        CameraExplorationUiState.Searching -> {
            stringResource(
                R.string.camera_exploration_searching,
            )
        }

        is CameraExplorationUiState.PlaceFound -> {
            stringResource(
                R.string.camera_exploration_place_found,
                explorationPlaceName(state.scene),
            )
        }

        is CameraExplorationUiState.Holding -> {
            stringResource(
                R.string.camera_exploration_holding,
                explorationPlaceName(state.scene),
            )
        }

        CameraExplorationUiState.SensorUnavailable -> {
            stringResource(
                R.string.camera_exploration_sensor_unavailable,
            )
        }
    }
}

@Composable
private fun explorationPlaceName(
    scene: AppScene,
): String {
    val resource = when (scene) {
        AppScene.WATERFRONT -> R.string.camera_place_waterfront
        AppScene.CAFE -> R.string.camera_place_cafe
        AppScene.GREEN_SPACE -> R.string.camera_place_green_space
        AppScene.URBAN_STREET -> R.string.camera_place_urban_street
        AppScene.LIBRARY -> R.string.camera_place_library
        AppScene.MUSEUM -> R.string.camera_place_museum
        AppScene.GREENHOUSE -> R.string.camera_place_greenhouse
        AppScene.UNKNOWN -> R.string.camera_place_unknown
    }

    return stringResource(resource)
}
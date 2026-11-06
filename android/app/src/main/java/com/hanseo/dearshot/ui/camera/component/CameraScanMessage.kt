package com.hanseo.dearshot.ui.camera.component

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.hanseo.dearshot.R
import com.hanseo.dearshot.ui.camera.AnalysisLabelResources
import com.hanseo.dearshot.ui.camera.CameraScanPresentation

@Composable
fun cameraScanMessage(
    stage: CameraScanStage,
    presentation: CameraScanPresentation?,
    fallbackMessage: String,
): String {
    return when (stage) {
        CameraScanStage.RECOGNIZING -> {
            val scene = presentation?.scene

            if (scene == null) {
                fallbackMessage
            } else {
                val placeName =
                    AnalysisLabelResources
                        .sceneResource(scene.label)
                        ?.let { resource ->
                            stringResource(resource)
                        }
                        ?: AnalysisLabelResources.fallback(
                            scene.label,
                        )

                stringResource(
                    R.string.camera_scan_place_found,
                    placeName,
                )
            }
        }

        CameraScanStage.RECOMMENDING -> {
            stringResource(
                R.string.camera_scan_choosing_composition,
            )
        }

        CameraScanStage.STABILIZING,
        CameraScanStage.COMPLETE -> {
            fallbackMessage
        }
    }
}
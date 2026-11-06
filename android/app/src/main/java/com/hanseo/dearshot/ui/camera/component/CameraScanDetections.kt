package com.hanseo.dearshot.ui.camera.component

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.ui.camera.CameraScanPresentation
import kotlinx.coroutines.delay

@Composable
fun CameraScanDetections(
    presentation: CameraScanPresentation,
    mirror: Boolean,
    modifier: Modifier = Modifier,
) {
    var sceneVisible by remember(presentation) {
        mutableStateOf(false)
    }

    var objectsVisible by remember(presentation) {
        mutableStateOf(false)
    }

    LaunchedEffect(presentation) {
        delay(150)

        sceneVisible = true

        delay(300)

        objectsVisible = true

        delay(1_000)

        objectsVisible = false
    }

    Box(modifier = modifier) {
        presentation.objectAnalysis?.let { objects ->
            AnimatedVisibility(
                visible = objectsVisible,
                enter = fadeIn(
                    animationSpec = tween(250),
                ),
                exit = fadeOut(
                    animationSpec = tween(250),
                ),
                modifier = Modifier.matchParentSize(),
            ) {
                CameraObjectOverlay(
                    analysis = objects,
                    mirror = mirror,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }

        presentation.scene?.let { scene ->
            AnimatedVisibility(
                visible = sceneVisible,
                enter = fadeIn(
                    animationSpec = tween(250),
                ),
                exit = fadeOut(
                    animationSpec = tween(200),
                ),
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .padding(
                        start = 16.dp,
                        top = 64.dp,
                    ),
            ) {
                CameraSceneLabels(
                    candidates = listOf(scene),
                )
            }
        }
    }
}
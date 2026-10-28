package com.hanseo.dearshot.ui.camera.component

import android.util.Log
import android.view.View
import android.view.ViewOutlineProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.hanseo.dearshot.camera.CameraSession
import androidx.compose.runtime.rememberUpdatedState
import com.hanseo.dearshot.camera.CameraLens
import com.hanseo.dearshot.camera.CameraZoomInfo

@Composable
fun CameraPreview(
    cameraSession: CameraSession,
    lens: CameraLens,
    onConnectionChanged: (Boolean, Boolean, Boolean) -> Unit,
    onZoomChanged: (CameraZoomInfo?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val currentOnConnectionChanged by rememberUpdatedState(
        onConnectionChanged
    )

    val currentOnZoomChanged by rememberUpdatedState(
        onZoomChanged
    )

    val previewView = remember(context) {
        PreviewView(context).apply {
            implementationMode =
                PreviewView.ImplementationMode.COMPATIBLE

            scaleType = PreviewView.ScaleType.FILL_CENTER

            outlineProvider = ViewOutlineProvider.BOUNDS
            clipToOutline = true
        }
    }

    var hasError by remember {
        mutableStateOf(false)
    }

    var retryCount by remember {
        mutableIntStateOf(0)
    }

    DisposableEffect(
        cameraSession,
        previewView,
        lifecycleOwner,
        lens,
        retryCount,
    ) {
        var disposed = false

        // 같은 화면 조건으로 중복 연결하는 것을 방지한다.
        var lastGeometry: List<Int>? = null

        fun connectIfReady() {
            if (disposed) return

            val display = previewView.display ?: return
            val viewPort = previewView.viewPort ?: return

            val geometry = listOf(
                previewView.width,
                previewView.height,
                display.rotation,
                previewView.layoutDirection,
            )

            if (geometry == lastGeometry) return

            lastGeometry = geometry
            hasError = false

            currentOnConnectionChanged(false, false, false)

            cameraSession.start(
                lifecycleOwner = lifecycleOwner,
                surfaceProvider = previewView.surfaceProvider,
                viewPort = viewPort,
                lens = lens,
                onBound = { canSwitchCamera, hasFlashUnit ->
                    currentOnConnectionChanged(
                        true,
                        canSwitchCamera,
                        hasFlashUnit,
                    )
                },
                onZoomChanged = { info ->
                    currentOnZoomChanged(info)
                },
                onError = { exception ->
                    Log.e(
                        "CameraPreview",
                        "Failed to start camera",
                        exception,
                    )

                    currentOnConnectionChanged(false, false, false)
                    hasError = true
                },
            )
        }

        val layoutListener =
            View.OnLayoutChangeListener {
                    _, _, _, _, _, _, _, _, _ ->
                connectIfReady()
            }

        previewView.addOnLayoutChangeListener(layoutListener)

        // 이미 배치된 View로 Effect가 다시 시작되는 경우도 처리한다.
        val initialConnection = Runnable {
            connectIfReady()
        }

        previewView.post(initialConnection)

        onDispose {
            disposed = true

            previewView.removeCallbacks(initialConnection)
            previewView.removeOnLayoutChangeListener(
                layoutListener
            )

            cameraSession.stop()
            currentOnConnectionChanged(false, false, false)
        }
    }

    Box(modifier = modifier) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                previewView
            },
        )

        if (hasError) {
            CameraErrorContent(
                onRetry = { retryCount += 1 },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

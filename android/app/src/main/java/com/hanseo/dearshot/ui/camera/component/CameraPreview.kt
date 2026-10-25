package com.hanseo.dearshot.ui.camera.component

import android.util.Log
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.hanseo.dearshot.R
import com.hanseo.dearshot.camera.CameraSession

@Composable
fun CameraPreview(
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val cameraSession = remember(context) { CameraSession(context) }

    val previewView = remember(context) {
        PreviewView(context).apply {
            implementationMode =
                PreviewView.ImplementationMode.COMPATIBLE

            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }

    var hasError by remember { mutableStateOf(false) }

    var retryCount by remember { mutableIntStateOf(0) }

    DisposableEffect(
        cameraSession,
        previewView,
        lifecycleOwner,
        retryCount
    ) {
        hasError = false

        cameraSession.start(
            lifecycleOwner = lifecycleOwner,
            surfaceProvider = previewView.surfaceProvider,
            onError = { exception ->
                Log.e(
                    "CameraPreview",
                    "Failed to start camera",
                    exception
                )
                hasError = true
            },
        )

        onDispose {
            cameraSession.stop()
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
            Surface(
                modifier = Modifier.fillMaxSize(),
                color = MaterialTheme.colorScheme.background,
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(
                        space = 16.dp,
                        alignment = Alignment.CenterVertically,
                    ),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        text = stringResource(
                            R.string.camera_preview_start_failed
                        ),
                        textAlign = TextAlign.Center,
                    )

                    Button(
                        onClick = {
                            retryCount += 1
                        },
                    ) {
                        Text(
                            text = stringResource(
                                R.string.camera_preview_retry
                            )
                        )
                    }
                }
            }
        }
    }
}
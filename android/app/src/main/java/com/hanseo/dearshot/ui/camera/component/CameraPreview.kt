package com.hanseo.dearshot.ui.camera.component

import android.annotation.SuppressLint
import android.util.Log
import android.view.View
import android.view.ViewOutlineProvider
import android.view.ScaleGestureDetector
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
import android.view.GestureDetector
import android.view.MotionEvent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.ui.geometry.Offset
import kotlinx.coroutines.delay
import com.hanseo.dearshot.analysis.scene.SceneClassification

@Composable
fun CameraPreview(
    cameraSession: CameraSession,
    lens: CameraLens,
    onConnectionChanged: (Boolean, Boolean, Boolean) -> Unit,
    onZoomChanged: (CameraZoomInfo?) -> Unit,
    focusEnabled: Boolean,
    modifier: Modifier = Modifier,
    onSceneAnalyzed: (SceneClassification) -> Unit = {},
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val currentOnConnectionChanged by rememberUpdatedState(
        onConnectionChanged
    )

    val currentOnZoomChanged by rememberUpdatedState(
        onZoomChanged
    )

    val currentFocusEnabled by rememberUpdatedState(
        focusEnabled
    )

    val currentOnSceneAnalyzed by rememberUpdatedState(
        onSceneAnalyzed
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

    var focusPosition by remember(lens) {
        mutableStateOf<Offset?>(null)
    }

    var focusSequence by remember {
        mutableLongStateOf(0L)
    }

    LaunchedEffect(lens, focusSequence) {
        if (focusPosition != null) {
            delay(1_200L)
            focusPosition = null
        }
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
                onSceneAnalyzed = { result ->
                    currentOnSceneAnalyzed(result)
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

    DisposableEffect(previewView, cameraSession, lens) {
        var hadMultiplePointers = false

        val scaleDetector = ScaleGestureDetector(
            context,
            object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                override fun onScaleBegin(
                    detector: ScaleGestureDetector,
                ): Boolean {
                    if (!currentFocusEnabled) return false

                    focusPosition = null
                    return true
                }

                override fun onScale(
                    detector: ScaleGestureDetector,
                ): Boolean {
                    if (!currentFocusEnabled) return false

                    cameraSession.zoomBy(detector.scaleFactor)
                    return true
                }
            },
        )

        val tapDetector = GestureDetector(
            context,
            object : GestureDetector.SimpleOnGestureListener() {

                override fun onDown(
                    event: MotionEvent,
                ): Boolean {
                    return true
                }

                override fun onSingleTapUp(
                    event: MotionEvent,
                ): Boolean {
                    if (!currentFocusEnabled || hadMultiplePointers) {
                        return false
                    }

                    val point = previewView.meteringPointFactory
                        .createPoint(
                            event.x,
                            event.y,
                        )

                    focusPosition = Offset(
                        x = event.x,
                        y = event.y,
                    )

                    focusSequence += 1

                    previewView.performClick()
                    cameraSession.focusAt(point)

                    return true
                }
            },
        )

        // 단일 탭의 performClick()은 위 제스처 콜백에서 호출한다.
        @SuppressLint("ClickableViewAccessibility")
        val touchListener = View.OnTouchListener { _, event ->
            if (!currentFocusEnabled) {
                false
            } else {
                if (event.actionMasked == MotionEvent.ACTION_DOWN) {
                    hadMultiplePointers = false
                }

                if (event.pointerCount > 1) {
                    hadMultiplePointers = true
                }

                scaleDetector.onTouchEvent(event)
                tapDetector.onTouchEvent(event)

                // DOWN부터 소비해서 후속 MOVE와 UP 이벤트도 받는다.
                true
            }
        }

        previewView.setOnTouchListener(touchListener)

        onDispose {
            previewView.setOnTouchListener(null)
        }
    }

    Box(modifier = modifier) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = {
                previewView
            },
        )

        focusPosition?.let { position ->
            if (focusEnabled && !hasError) {
                CameraFocusIndicator(
                    position = position,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }

        if (hasError) {
            CameraErrorContent(
                onRetry = { retryCount += 1 },
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

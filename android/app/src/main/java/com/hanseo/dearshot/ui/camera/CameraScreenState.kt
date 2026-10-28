package com.hanseo.dearshot.ui.camera

import android.os.SystemClock
import com.hanseo.dearshot.analysis.detection.ObjectDetection
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import android.util.Log
import androidx.annotation.MainThread
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import com.hanseo.dearshot.camera.CameraLens
import com.hanseo.dearshot.camera.CameraSession
import com.hanseo.dearshot.data.local.photo.CapturedPhotoStore
import java.io.File
import kotlin.coroutines.resume
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import com.hanseo.dearshot.camera.CameraZoomInfo
import com.hanseo.dearshot.analysis.scene.SceneClassification

data class SceneCandidateUi(
    val label: String,
    val score: Float,
)

data class ObjectBoxUi(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
)

data class DetectedObjectUi(
    val label: String,
    val score: Float,
    val box: ObjectBoxUi,
)

data class ObjectAnalysisUi(
    val imageWidth: Int,
    val imageHeight: Int,
    val objects: List<DetectedObjectUi>,
    val receivedAtMs: Long,
)

data class CameraAnalysisUiState(
    val sceneCandidates: List<SceneCandidateUi> = emptyList(),
    val objectAnalysis: ObjectAnalysisUi? = null,
)

class CameraScreenState(
    val session: CameraSession,
    private val lensState: MutableState<CameraLens>,
    private val photoStore: CapturedPhotoStore,
    private val scope: CoroutineScope,
) {
    private var objectExpiryJob: Job? = null

    val selectedLens: CameraLens
        get() = lensState.value

    var isBound by mutableStateOf(false)
        private set

    private var supportsSwitching by mutableStateOf(false)

    private var supportsFlash by mutableStateOf(false)

    var flashEnabled by mutableStateOf(false)
        private set

    var isCapturing by mutableStateOf(false)
        private set

    var captureFailed by mutableStateOf(false)
        private set

    // 현재 화면에서 촬영한 개수.
    // 영구 저장된 전체 개수는 사진 목록 기능에서 연결한다.
    var photoCount by mutableStateOf(0)
        private set

    var analysisUiState by mutableStateOf(CameraAnalysisUiState())
        private set

    val canCapture: Boolean
        get() = isBound && !isCapturing

    val canSwitchCamera: Boolean
        get() = isBound && supportsSwitching && !isCapturing

    val canChangeFlash: Boolean
        get() = isBound && supportsFlash && !isCapturing

    var zoomInfo by mutableStateOf<CameraZoomInfo?>(null)
        private set

    val canChangeZoom: Boolean
        get() = isBound && zoomInfo != null && !isCapturing


    @MainThread
    fun updateConnection(
        bound: Boolean,
        canSwitch: Boolean,
        hasFlash: Boolean,
    ) {
        isBound = bound
        supportsSwitching = bound && canSwitch
        supportsFlash = bound && hasFlash

        if (!bound) {
            zoomInfo = null
            objectExpiryJob?.cancel()
            objectExpiryJob = null
            analysisUiState = CameraAnalysisUiState()
        }

        if (bound) {
            if (!hasFlash) {
                flashEnabled = false
            }

            session.setFlashEnabled(flashEnabled)
        }
    }

    @MainThread
    fun changeFlash(enabled: Boolean) {
        if (!canChangeFlash) return

        session.setFlashEnabled(enabled)
        flashEnabled = enabled
    }

    @MainThread
    fun switchCamera() {
        if (!canSwitchCamera) return

        updateConnection(
            bound = false,
            canSwitch = false,
            hasFlash = false
        )

        lensState.value = selectedLens.opposite()
    }

    @MainThread
    fun updateZoom(info: CameraZoomInfo?) {
        zoomInfo = info
    }

    @MainThread
    fun changeZoom(ratio: Float) {
        if (!canChangeZoom) return

        session.setZoomRatio(ratio)
    }

    @MainThread
    fun capture() {
        if (!canCapture) return

        // 코루틴 시작 전에 설정해서 연속 클릭을 차단한다.
        isCapturing = true
        captureFailed = false

        scope.launch {
            try {
                val outputFile = withContext(Dispatchers.IO) {
                    photoStore.createOutputFile()
                }

                check(isBound) {
                    "Camera was disconnected before capture"
                }

                val result = awaitPhoto(outputFile)

                result.fold(
                    onSuccess = { file ->
                        photoCount += 1

                        Log.d(
                            "CameraCapture",
                            "Photo saved: ${file.absolutePath}",
                        )
                    },
                    onFailure = { exception ->
                        captureFailed = true

                        Log.e(
                            "CameraCapture",
                            "Failed to capture photo",
                            exception,
                        )
                    },
                )
            } catch (exception: CancellationException) {
                throw exception
            } catch (exception: Exception) {
                captureFailed = true

                Log.e(
                    "CameraCapture",
                    "Failed to prepare capture",
                    exception,
                )
            } finally {
                isCapturing = false
            }
        }
    }

    @MainThread
    fun dismissCaptureError() {
        captureFailed = false
    }

    private suspend fun awaitPhoto(
        outputFile: File,
    ): Result<File> = suspendCancellableCoroutine { continuation ->
        session.takePhoto(
            outputFile = outputFile,
            onResult = { result ->
                if (continuation.isActive) {
                    continuation.resume(result)
                }
            },
        )
    }

    @MainThread
    fun updateSceneAnalysis(
        result: SceneClassification,
    ) {
        if (!isBound) return

        analysisUiState = analysisUiState.copy(
            sceneCandidates = result.candidates
                .take(3)
                .map { candidate ->
                    SceneCandidateUi(
                        label = candidate.label,
                        score = candidate.confidence,
                    )
                },
        )
    }

    @MainThread
    fun updateObjectAnalysis(result: ObjectDetection?) {
        if (!isBound) return
        objectExpiryJob?.cancel()
        objectExpiryJob = null
        analysisUiState = analysisUiState.copy(
            objectAnalysis = result?.let {
                ObjectAnalysisUi(
                    imageWidth = it.imageWidth,
                    imageHeight = it.imageHeight,
                    objects = it.objects.map { detected ->
                        DetectedObjectUi(
                            label = detected.label,
                            score = detected.confidence,
                            box = ObjectBoxUi(
                                detected.box.left, detected.box.top,
                                detected.box.right, detected.box.bottom,
                            ),
                        )
                    },
                    receivedAtMs = SystemClock.elapsedRealtime(),
                )
            },
        )
        if (result != null) {
            // 수신이 멈추거나 앱이 비활성화되면 이전 박스를 계속 남기지 않는다.
            objectExpiryJob = scope.launch {
                delay(1_500L)
                analysisUiState = analysisUiState.copy(objectAnalysis = null)
            }
        }
    }

}

@Composable
fun rememberCameraScreenState(): CameraScreenState {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val lensState = rememberSaveable {
        mutableStateOf(CameraLens.BACK)
    }

    return remember(context, scope, lensState) {
        CameraScreenState(
            session = CameraSession(context),
            lensState = lensState,
            photoStore = CapturedPhotoStore(context),
            scope = scope,
        )
    }
}
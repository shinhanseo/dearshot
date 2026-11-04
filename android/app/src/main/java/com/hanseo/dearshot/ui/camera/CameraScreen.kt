package com.hanseo.dearshot.ui.camera

import com.hanseo.dearshot.ui.camera.component.CameraObjectOverlay
import com.hanseo.dearshot.camera.CameraLens
import com.hanseo.dearshot.BuildConfig
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.hanseo.dearshot.ui.camera.component.CameraCaptureControls
import com.hanseo.dearshot.ui.camera.component.CameraCaptureErrorDialog
import com.hanseo.dearshot.ui.camera.component.CameraPermissionContent
import com.hanseo.dearshot.ui.camera.component.CameraPreview
import com.hanseo.dearshot.ui.camera.component.CameraTopBar
import com.hanseo.dearshot.ui.camera.permission.rememberCameraPermissionState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.ui.camera.component.CameraZoomControls
import com.hanseo.dearshot.ui.camera.component.CameraSceneLabels
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import android.util.Log
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hanseo.dearshot.ui.camera.component.CameraRecommendationBanner

@Composable
fun CameraScreen(
    onOpenTemplates: () -> Unit,
    onOpenLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val permissionState = rememberCameraPermissionState()
    val cameraState = rememberCameraScreenState()

    val recommendationViewModel: CameraRecommendationViewModel = hiltViewModel()

    val recommendationState by
    recommendationViewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(recommendationState) {
        val finished = recommendationState as? CameraRecommendationUiState.Finished
        if (BuildConfig.DEBUG && finished?.response?.status == "COMPLETED") {
            finished.response.result?.recommendation?.template?.let { template ->
                Log.d(
                    "SceneRecommendation",
                    "Recommended template id=${template.id}, version=${template.version}",
                )
            }
        }
    }

    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding(),
        ) {
            CameraTopBar(
                placeName = null,
                templateName = null,
                flashEnabled = cameraState.flashEnabled,
                flashAvailable =
                    permissionState.isGranted && cameraState.canChangeFlash,
                onFlashChange = cameraState::changeFlash,
                onCompositionClick = onOpenTemplates,
                onMyPageClick = {
                    // 마이페이지 이동 연결 예정
                },
            )

            if (permissionState.isGranted) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                ) {
                    CameraPreview(
                        cameraSession = cameraState.session,
                        lens = cameraState.selectedLens,
                        onConnectionChanged =
                            cameraState::updateConnection,
                        onZoomChanged = cameraState::updateZoom,
                        onSceneAnalyzed = cameraState::updateSceneAnalysis,
                        onObjectsAnalyzed = cameraState::updateObjectAnalysis,
                        onRecommendationSnapshot = recommendationViewModel::onSnapshotReady,
                        focusEnabled = cameraState.canCapture,
                        modifier = Modifier.fillMaxSize(),
                    )

                    if (BuildConfig.DEBUG) {
                        CameraObjectOverlay(
                            analysis = cameraState.analysisUiState.objectAnalysis,
                            mirror = cameraState.selectedLens == CameraLens.FRONT,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }

                    CameraSceneLabels(
                        candidates = cameraState.analysisUiState.sceneCandidates,
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(16.dp),
                    )

                    cameraState.zoomInfo?.let { zoomInfo ->
                        CameraZoomControls(
                            zoomInfo = zoomInfo,
                            enabled = cameraState.canChangeZoom,
                            onZoomSelected = cameraState::changeZoom,
                            modifier = Modifier
                                .align(Alignment.BottomCenter)
                                .padding(bottom = 12.dp),
                        )
                    }

                    CameraRecommendationBanner(
                        state = recommendationState,
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                    )
                }
            } else {
                CameraPermissionContent(
                    wasDenied = permissionState.wasDenied,
                    onRequestPermission =
                        permissionState.requestPermission,
                    onOpenSettings = permissionState.openSettings,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            }

            CameraCaptureControls(
                photoCount = cameraState.photoCount,
                captureEnabled =
                    permissionState.isGranted && cameraState.canCapture,
                isCapturing = cameraState.isCapturing,
                switchCameraEnabled =
                    permissionState.isGranted && cameraState.canSwitchCamera,
                onOpenPhotos = {
                    // 촬영 사진 목록 연결 예정
                },
                onCapture = cameraState::capture,
                onSwitchCamera = cameraState::switchCamera,
            )
        }
    }

    if (cameraState.captureFailed) {
        CameraCaptureErrorDialog(
            onDismiss = cameraState::dismissCaptureError,
        )
    }
}

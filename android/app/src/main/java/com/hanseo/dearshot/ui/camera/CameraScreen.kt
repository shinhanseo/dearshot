package com.hanseo.dearshot.ui.camera

import android.os.SystemClock
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.hanseo.dearshot.R
import com.hanseo.dearshot.camera.CameraLens
import com.hanseo.dearshot.ui.camera.component.CameraCaptureControls
import com.hanseo.dearshot.ui.camera.component.CameraCaptureErrorDialog
import com.hanseo.dearshot.ui.camera.component.CameraObjectOverlay
import com.hanseo.dearshot.ui.camera.component.CameraPermissionContent
import com.hanseo.dearshot.ui.camera.component.CameraPreview
import com.hanseo.dearshot.ui.camera.component.CameraRecommendationBanner
import com.hanseo.dearshot.ui.camera.component.CameraScanOverlay
import com.hanseo.dearshot.ui.camera.component.CameraScanStage
import com.hanseo.dearshot.ui.camera.component.CameraSceneLabels
import com.hanseo.dearshot.ui.camera.component.CameraTemplateOverlay
import com.hanseo.dearshot.ui.camera.component.CameraTopBar
import com.hanseo.dearshot.ui.camera.component.CameraZoomControls
import com.hanseo.dearshot.ui.camera.permission.rememberCameraPermissionState
import kotlinx.coroutines.delay
import androidx.compose.runtime.rememberUpdatedState
import com.hanseo.dearshot.ui.camera.component.CameraScanDetections

@Composable
fun CameraScreen(
    onOpenTemplates: () -> Unit,
    onOpenLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val permissionState = rememberCameraPermissionState()
    val cameraState = rememberCameraScreenState()
    val recommendationViewModel: CameraRecommendationViewModel = hiltViewModel()
    val recommendationState by recommendationViewModel.uiState.collectAsStateWithLifecycle()

    val recommendedTemplate =
        (recommendationState as? CameraRecommendationUiState.Finished)?.template

    val initialScanStage = when (recommendationState) {
        CameraRecommendationUiState.Idle -> {
            if (cameraState.canCapture) CameraScanStage.STABILIZING else null
        }

        CameraRecommendationUiState.Loading -> CameraScanStage.RECOGNIZING

        is CameraRecommendationUiState.Finished -> {
            if (recommendedTemplate != null) CameraScanStage.COMPLETE else null
        }

        else -> null
    }

    var scanStage by remember { mutableStateOf<CameraScanStage?>(null) }
    var scanStartedAt by remember { mutableStateOf<Long?>(null) }


    var scanPresentation by remember {
        mutableStateOf<CameraScanPresentation?>(null)
    }

    val latestAnalysis by rememberUpdatedState(
        cameraState.analysisUiState,
    )

    LaunchedEffect(recommendationState, initialScanStage) {
        when (initialScanStage) {
            CameraScanStage.RECOGNIZING -> {
                // 요청이 시작되는 순간의 인식 결과를 저장한다.
                scanPresentation = CameraScanPresentation.from(
                    analysis = latestAnalysis,
                )

                scanStartedAt = SystemClock.elapsedRealtime()
                scanStage = CameraScanStage.RECOGNIZING

                delay(650)

                scanStage = CameraScanStage.RECOMMENDING
            }

            CameraScanStage.COMPLETE -> {
                scanStartedAt?.let { startedAt ->
                    val elapsed =
                        SystemClock.elapsedRealtime() - startedAt

                    delay(
                        (1_200L - elapsed).coerceAtLeast(0L),
                    )
                }

                scanStartedAt = null
                scanStage = CameraScanStage.COMPLETE

                delay(800)

                scanStage = null
                scanPresentation = null
            }

            else -> {
                scanStartedAt = null
                scanPresentation = null
                scanStage = initialScanStage
            }
        }
    }

    val isScanning = scanStage == CameraScanStage.RECOGNIZING ||
        scanStage == CameraScanStage.RECOMMENDING

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
                templateName = recommendedTemplate?.title?.takeUnless { isScanning },
                flashEnabled = cameraState.flashEnabled,
                flashAvailable = permissionState.isGranted && cameraState.canChangeFlash,
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
                        onConnectionChanged = cameraState::updateConnection,
                        onZoomChanged = cameraState::updateZoom,
                        onMotionChanged = cameraState::updateMotion,
                        onSceneAnalyzed = cameraState::updateSceneAnalysis,
                        onObjectsAnalyzed = cameraState::updateObjectAnalysis,
                        onRecommendationSnapshot = recommendationViewModel::onSnapshotReady,
                        focusEnabled = cameraState.canCapture,
                        modifier = Modifier.fillMaxSize(),
                    )

                    recommendedTemplate?.takeUnless { isScanning }?.let { template ->
                        CameraTemplateOverlay(
                            guide = template.guide,
                            modifier = Modifier.matchParentSize(),
                        )
                    }

                    val stage = scanStage

                    if (isScanning) {
                        scanPresentation?.let { presentation ->
                            CameraScanDetections(
                                presentation = presentation,
                                mirror = cameraState.selectedLens == CameraLens.FRONT,
                                modifier = Modifier.matchParentSize(),
                            )
                        }
                    }

                    if (stage != null) {
                        val messages = stringArrayResource(R.array.camera_scan_messages)

                        CameraScanOverlay(
                            stage = stage,
                            message = if (stage == CameraScanStage.STABILIZING &&
                                cameraState.motionStatus == com.hanseo.dearshot.camera.motion.CameraMotionStatus.STABLE
                            ) stringResource(R.string.camera_scan_checking_place)
                            else if (stage == CameraScanStage.STABILIZING &&
                                cameraState.motionStatus == com.hanseo.dearshot.camera.motion.CameraMotionStatus.UNAVAILABLE
                            ) stringResource(R.string.camera_scan_sensor_unavailable)
                            else messages[stage.ordinal],
                            stepLabels = stringArrayResource(R.array.camera_scan_stages).toList(),
                            manualSelectionLabel = stringResource(
                                R.string.camera_scan_manual_selection,
                            ),
                            onManualSelection = onOpenTemplates,
                            modifier = Modifier.matchParentSize(),
                        )
                    } else {
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

                        if (recommendedTemplate == null) {
                            CameraRecommendationBanner(
                                state = recommendationState,
                                modifier = Modifier
                                    .align(Alignment.TopCenter)
                                    .padding(horizontal = 16.dp, vertical = 12.dp),
                            )
                        }
                    }
                }
            } else {
                CameraPermissionContent(
                    wasDenied = permissionState.wasDenied,
                    onRequestPermission = permissionState.requestPermission,
                    onOpenSettings = permissionState.openSettings,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            }

            CameraCaptureControls(
                photoCount = cameraState.photoCount,
                captureEnabled = permissionState.isGranted && cameraState.canCapture,
                isCapturing = cameraState.isCapturing,
                switchCameraEnabled = permissionState.isGranted && cameraState.canSwitchCamera,
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
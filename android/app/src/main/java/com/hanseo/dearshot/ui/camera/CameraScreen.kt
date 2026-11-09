package com.hanseo.dearshot.ui.camera

import android.os.SystemClock
import com.hanseo.dearshot.analysis.scene.AppScene
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
import com.hanseo.dearshot.ui.camera.component.CameraPermissionContent
import com.hanseo.dearshot.ui.camera.component.CameraPreview
import com.hanseo.dearshot.ui.camera.component.CameraRecommendationBanner
import com.hanseo.dearshot.ui.camera.component.CameraScanOverlay
import com.hanseo.dearshot.ui.camera.component.CameraScanStage
import com.hanseo.dearshot.ui.camera.component.CameraTemplateOverlay
import com.hanseo.dearshot.ui.camera.component.CameraTopBar
import com.hanseo.dearshot.ui.camera.component.CameraZoomControls
import com.hanseo.dearshot.ui.camera.permission.rememberCameraPermissionState
import kotlinx.coroutines.delay
import androidx.compose.runtime.rememberUpdatedState
import com.hanseo.dearshot.ui.camera.component.CameraScanDetections
import com.hanseo.dearshot.ui.camera.component.cameraScanMessage
import com.hanseo.dearshot.ui.camera.component.cameraExplorationMessage
import com.hanseo.dearshot.ui.camera.component.CameraRecommendationSelectionCard
import com.hanseo.dearshot.ui.camera.component.CameraGuideSettingsSheet
import com.hanseo.dearshot.data.remote.template.TemplateSummaryResponse
import com.hanseo.dearshot.ui.camera.component.CameraTemplatePreviewDialog
import com.hanseo.dearshot.ui.camera.component.CameraTemplateSelectionSheet

@Composable
fun CameraScreen(
    onOpenLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val permissionState = rememberCameraPermissionState()
    val cameraState = rememberCameraScreenState()
    val explorationState = resolveCameraExplorationState(
        isCameraReady = cameraState.isBound,
        scene = cameraState.recognizedScene,
        motionStatus = cameraState.motionStatus,
    )
    val recommendationViewModel: CameraRecommendationViewModel = hiltViewModel()
    val recommendationState by recommendationViewModel.uiState.collectAsStateWithLifecycle()

    val manualTemplateState by
        recommendationViewModel.manualTemplateState.collectAsStateWithLifecycle()

    val recommendedTemplate = manualTemplateState.template
        ?: (recommendationState as? CameraRecommendationUiState.Finished)?.template

    val templateSelectionViewModel: TemplateSelectionViewModel =
        hiltViewModel()

    val templateSelectionState by
    templateSelectionViewModel.uiState.collectAsStateWithLifecycle()

    val templateSceneState by
        templateSelectionViewModel.sceneState.collectAsStateWithLifecycle()

    var showTemplateSelection by remember {
        mutableStateOf(false)
    }

    var previewTemplate by remember {
        mutableStateOf<TemplateSummaryResponse?>(null)
    }

    var showGuideSettings by remember(
        recommendedTemplate?.id,
        recommendedTemplate?.version,
    ) {
        mutableStateOf(false)
    }

    fun openTemplateSelection() {
        if (showTemplateSelection) {
            return
        }

        showGuideSettings = false

        val detectedSceneKey = when (cameraState.recognizedScene) {
            AppScene.WATERFRONT -> "waterfront"
            AppScene.CAFE -> "cafe"
            AppScene.GREEN_SPACE -> "green-space"
            AppScene.URBAN_STREET -> "urban-street"
            AppScene.LIBRARY -> "library"
            AppScene.MUSEUM -> "museum"
            AppScene.GREENHOUSE -> "greenhouse"
            AppScene.UNKNOWN -> null
        }
        val initialSceneKey =
            (recommendationState as? CameraRecommendationUiState.Finished)
                ?.response?.result?.scene?.sceneKey
                ?.takeIf { it in (recommendedTemplate?.sceneKeys ?: emptyList()) }
                ?: recommendedTemplate?.sceneKeys?.firstOrNull()
                ?: detectedSceneKey
        templateSelectionViewModel.loadTemplates(scene = initialSceneKey)

        showTemplateSelection = true
    }

    LaunchedEffect(manualTemplateState.applicationVersion) {
        if (manualTemplateState.template != null) {
            previewTemplate = null
            showTemplateSelection = false
            showGuideSettings = false
            cameraState.changeGuideVisibility(true)
        }
    }

    val finishedState =
        recommendationState as? CameraRecommendationUiState.Finished

    val needsManualSelection =
        manualTemplateState.template == null &&
        finishedState?.response?.status == "NEEDS_USER_SELECTION" &&
                finishedState.response.result?.reasonCode ==
                "LOW_RECOMMENDATION_CONFIDENCE"

    var isResettingRecommendation by remember {
        mutableStateOf(false)
    }

    LaunchedEffect(cameraState.isBound, recommendationState) {
        isResettingRecommendation = false
    }

    fun restartRecommendation() {
        // 초기화 중이거나 카메라가 연결되지 않았다면 실행하지 않는다.
        if (
            isResettingRecommendation ||
            !cameraState.isBound ||
            recommendationState == CameraRecommendationUiState.Loading
        ) {
            return
        }

        isResettingRecommendation = true

        val accepted = cameraState.session.resetRecommendation(
            onReset = {
                // 분석기의 추천 잠금이 풀린 뒤,
                // 기존 결과를 지우고 새 스냅샷을 받을 준비를 한다.
                recommendationViewModel.prepareForRetry()

                showGuideSettings = false
                isResettingRecommendation = false
            },
        )

        if (!accepted) {
            // 초기화 요청을 등록하지 못하면 기존 결과를 유지한다.
            isResettingRecommendation = false
        }
    }

    LaunchedEffect(
        recommendedTemplate?.id,
        recommendedTemplate?.version,
    ) {
        if (recommendedTemplate != null) {
            cameraState.changeGuideVisibility(true)
        }
    }

    // 카메라가 끊기거나 요청 상태가 바뀌면 재시도 버튼 잠금을 해제한다.
    LaunchedEffect(cameraState.isBound, recommendationState) {
        isResettingRecommendation = false
    }

    val initialScanStage = if (manualTemplateState.template != null) {
        null
    } else when (recommendationState) {
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

    val isScanning = manualTemplateState.template == null && (
        scanStage == CameraScanStage.RECOGNIZING ||
            scanStage == CameraScanStage.RECOMMENDING
        )

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
                onCompositionClick = {
                    if (recommendedTemplate != null && !isScanning) {
                        showGuideSettings = true
                    } else {
                        openTemplateSelection()
                    }
                },
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

                    if (cameraState.isGuideVisible && !isScanning) {
                        recommendedTemplate?.let { template ->
                            CameraTemplateOverlay(
                                guide = template.guide,
                                modifier = Modifier.matchParentSize(),
                            )
                        }
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

                        val fallbackMessage =
                            if (
                                stage == CameraScanStage.STABILIZING &&
                                cameraState.motionStatus ==
                                com.hanseo.dearshot.camera.motion.CameraMotionStatus.STABLE
                            ) {
                                stringResource(
                                    R.string.camera_scan_checking_place,
                                )
                            } else if (
                                stage == CameraScanStage.STABILIZING &&
                                cameraState.motionStatus ==
                                com.hanseo.dearshot.camera.motion.CameraMotionStatus.UNAVAILABLE
                            ) {
                                stringResource(
                                    R.string.camera_scan_sensor_unavailable,
                                )
                            } else {
                                messages[stage.ordinal]
                            }

                        val scanMessage =
                            if (stage == CameraScanStage.STABILIZING) {
                                cameraExplorationMessage(
                                    state = explorationState,
                                )
                            } else {
                                cameraScanMessage(
                                    stage = stage,
                                    presentation = scanPresentation,
                                    fallbackMessage = fallbackMessage,
                                )
                            }

                        CameraScanOverlay(
                            stage = stage,
                            message = scanMessage,
                            stepLabels = stringArrayResource(R.array.camera_scan_stages).toList(),
                            manualSelectionLabel = stringResource(
                                R.string.camera_scan_manual_selection,
                            ),
                            onManualSelection = ::openTemplateSelection,
                            modifier = Modifier.matchParentSize(),
                        )
                    } else {
                        if (needsManualSelection) {
                            CameraRecommendationSelectionCard(
                                onRetry = {
                                    restartRecommendation()
                                },
                                onSelectManually = ::openTemplateSelection,
                                modifier = Modifier
                                    .align(Alignment.BottomCenter)
                                    .padding(
                                        horizontal = 16.dp,
                                        vertical = 12.dp,
                                    )
                                    .fillMaxWidth(),
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
                                        .padding(
                                            horizontal = 16.dp,
                                            vertical = 12.dp,
                                        ),
                                )
                            }
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

    if (showGuideSettings && !isScanning) {
        recommendedTemplate?.let { template ->
            CameraGuideSettingsSheet(
                template = template,
                isGuideVisible = cameraState.isGuideVisible,
                onGuideVisibilityChange =
                    cameraState::changeGuideVisibility,
                onDismiss = {
                    showGuideSettings = false
                },
                onSelectTemplate = ::openTemplateSelection,
                onReanalyze = {
                    restartRecommendation()
                },
            )
        }
    }
    if (showTemplateSelection) {
        CameraTemplateSelectionSheet(
            uiState = templateSelectionState,
            sceneState = templateSceneState,
            onSceneSelected = templateSelectionViewModel::selectScene,
            onTemplateClick = {
                recommendationViewModel.clearTemplateApplyError()
                previewTemplate = it
            },
            onRetry = templateSelectionViewModel::retry,
            onLoadMore = templateSelectionViewModel::loadMore,
            onDismiss = {
                showTemplateSelection = false
                previewTemplate = null
            },
        )
    }

    previewTemplate?.let { template ->
        CameraTemplatePreviewDialog(
            template = template,
            isApplying = manualTemplateState.isApplying,
            hasError = manualTemplateState.error != null,
            onApply = {
                recommendationViewModel.applyTemplate(template.id, template.version)
            },
            onDismiss = {
                recommendationViewModel.clearTemplateApplyError()
                previewTemplate = null
            },
        )
    }
}

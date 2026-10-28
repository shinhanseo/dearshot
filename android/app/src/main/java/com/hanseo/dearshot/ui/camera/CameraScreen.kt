package com.hanseo.dearshot.ui.camera

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

@Composable
fun CameraScreen(
    onOpenTemplates: () -> Unit,
    onOpenLogin: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val permissionState = rememberCameraPermissionState()
    val cameraState = rememberCameraScreenState()

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
                CameraPreview(
                    cameraSession = cameraState.session,
                    lens = cameraState.selectedLens,
                    onConnectionChanged = cameraState::updateConnection,
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
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

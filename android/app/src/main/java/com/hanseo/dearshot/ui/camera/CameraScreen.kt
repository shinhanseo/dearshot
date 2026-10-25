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
                flashEnabled = false,
                flashAvailable = false,
                onFlashChange = {
                    // 촬영용 플래시 기능 연결 예정
                },
                onCompositionClick = onOpenTemplates,
                onMyPageClick = {
                    // 마이페이지 이동 연결 예정
                },
            )

            if (permissionState.isGranted) {
                CameraPreview(
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
                photoCount = 0,
                captureEnabled = false,
                isCapturing = false,
                switchCameraEnabled = false,
                onOpenPhotos = {
                    // 촬영 사진 목록 연결 예정
                },
                onCapture = {
                    // ImageCapture 연결 예정
                },
                onSwitchCamera = {
                    // 전후면 카메라 전환 연결 예정
                },
            )
        }
    }
}
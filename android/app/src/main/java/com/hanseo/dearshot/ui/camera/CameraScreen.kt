package com.hanseo.dearshot.ui.camera

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.ui.camera.component.CameraNavigationActions
import com.hanseo.dearshot.ui.camera.component.CameraPermissionContent
import com.hanseo.dearshot.ui.camera.component.CameraPreview
import com.hanseo.dearshot.ui.camera.permission.rememberCameraPermissionState
import com.hanseo.dearshot.ui.camera.component.CameraTopBar
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
            verticalArrangement = Arrangement.spacedBy(
                space = 16.dp,
                alignment = Alignment.CenterVertically,
            ),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (permissionState.isGranted) {
                CameraTopBar(
                    placeName = null,
                    templateName = null,
                    flashEnabled = false,
                    flashAvailable = false,
                    onFlashChange = {
                        // 실제 촬영 기능을 추가하면서 연결
                    },
                    onCompositionClick = onOpenTemplates,
                    onMyPageClick = {
                        // 마이페이지 화면을 만들면서 연결
                    },
                )
                CameraPreview(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                )
            } else {
                CameraPermissionContent(
                    wasDenied = permissionState.wasDenied,
                    onRequestPermission = permissionState.requestPermission,
                    onOpenSettings = permissionState.openSettings,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            CameraNavigationActions(
                onOpenTemplates = onOpenTemplates,
                onOpenLogin = onOpenLogin,
            )
        }
    }
}

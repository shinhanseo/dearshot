package com.hanseo.dearshot.ui.camera.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.R
import com.hanseo.dearshot.ui.theme.DearShotTheme

@Composable
fun CameraCaptureControls(
    photoCount: Int,
    captureEnabled: Boolean,
    isCapturing: Boolean,
    switchCameraEnabled: Boolean,
    onOpenPhotos: () -> Unit,
    onCapture: () -> Unit,
    onSwitchCamera: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    horizontal = 24.dp,
                    vertical = 16.dp,
                ),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = onOpenPhotos,
                modifier = Modifier.size(48.dp),
            ) {
                BadgedBox(
                    badge = {
                        if (photoCount > 0) {
                            Badge(
                                containerColor =
                                    MaterialTheme.colorScheme.primary,
                                contentColor =
                                    MaterialTheme.colorScheme.onPrimary,
                            ) {
                                Text(
                                    text = if (photoCount > 99) {
                                        "99+"
                                    } else {
                                        photoCount.toString()
                                    }
                                )
                            }
                        }
                    },
                ) {
                    Icon(
                        painter = painterResource(
                            R.drawable.ic_camera_gallery
                        ),
                        contentDescription = stringResource(
                            R.string.camera_open_photos
                        ),
                        modifier = Modifier.size(24.dp),
                    )
                }
            }

            CameraShutterButton(
                enabled = captureEnabled && !isCapturing,
                isCapturing = isCapturing,
                onClick = onCapture,
            )

            IconButton(
                onClick = onSwitchCamera,
                enabled = switchCameraEnabled && !isCapturing,
                modifier = Modifier.size(48.dp),
            ) {
                Icon(
                    painter = painterResource(
                        R.drawable.ic_camera_switch
                    ),
                    contentDescription = stringResource(
                        R.string.camera_switch_lens
                    ),
                    modifier = Modifier.size(24.dp),
                )
            }
        }
    }
}

@Composable
private fun CameraShutterButton(
    enabled: Boolean,
    isCapturing: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val description = stringResource(
        if (isCapturing) {
            R.string.camera_capturing
        } else {
            R.string.camera_capture
        }
    )

    val shutterColor = MaterialTheme.colorScheme.primary.copy(
        alpha = if (enabled || isCapturing) 1f else 0.38f
    )

    Box(
        modifier = modifier
            .size(60.dp)
            .clip(CircleShape)
            .border(
                width = 2.dp,
                color = shutterColor,
                shape = CircleShape,
            )
            .clickable(
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics {
                contentDescription = description
            }
            .padding(6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .background(
                    color = shutterColor,
                    shape = CircleShape,
                ),
        )

        if (isCapturing) {
            CircularProgressIndicator(
                modifier = Modifier.size(24.dp),
                color = MaterialTheme.colorScheme.onPrimary,
                strokeWidth = 2.dp,
            )
        }
    }
}

@Preview(
    name = "Ready",
    widthDp = 390,
    showBackground = true,
)
@Composable
private fun CameraCaptureControlsPreview() {
    DearShotTheme {
        CameraCaptureControls(
            photoCount = 6,
            captureEnabled = true,
            isCapturing = false,
            switchCameraEnabled = true,
            onOpenPhotos = {},
            onCapture = {},
            onSwitchCamera = {},
        )
    }
}

@Preview(
    name = "Capturing",
    widthDp = 390,
    showBackground = true,
)
@Composable
private fun CameraCaptureControlsCapturingPreview() {
    DearShotTheme {
        CameraCaptureControls(
            photoCount = 0,
            captureEnabled = true,
            isCapturing = true,
            switchCameraEnabled = true,
            onOpenPhotos = {},
            onCapture = {},
            onSwitchCamera = {},
        )
    }
}
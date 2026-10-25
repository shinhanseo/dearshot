package com.hanseo.dearshot.ui.camera.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.R
import com.hanseo.dearshot.ui.theme.DearShotTheme

@Composable
fun CameraPermissionContent(
    wasDenied: Boolean,
    onRequestPermission: () -> Unit,
    onOpenSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(
            space = 16.dp,
            alignment = Alignment.CenterVertically,
        ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.camera_permission_title),
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center,
        )
        Text(
            text = stringResource(
                if (wasDenied) {
                    R.string.camera_permission_denied
                } else {
                    R.string.camera_permission_description
                }
            ),
            textAlign = TextAlign.Center,
        )
        Button(onClick = onRequestPermission) {
            Text(stringResource(R.string.camera_permission_request))
        }
        if (wasDenied) {
            TextButton(onClick = onOpenSettings) {
                Text(stringResource(R.string.camera_permission_open_settings))
            }
        }
    }
}

@Preview(name = "Permission required", showBackground = true)
@Composable
private fun CameraPermissionContentPreview() {
    DearShotTheme {
        CameraPermissionContent(
            wasDenied = false,
            onRequestPermission = {},
            onOpenSettings = {},
        )
    }
}

@Preview(name = "Permission denied", showBackground = true)
@Composable
private fun CameraPermissionDeniedPreview() {
    DearShotTheme {
        CameraPermissionContent(
            wasDenied = true,
            onRequestPermission = {},
            onOpenSettings = {},
        )
    }
}

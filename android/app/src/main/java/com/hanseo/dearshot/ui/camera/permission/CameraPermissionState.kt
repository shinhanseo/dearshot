package com.hanseo.dearshot.ui.camera.permission

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect

data class CameraPermissionState(
    val isGranted: Boolean,
    val wasDenied: Boolean,
    val requestPermission: () -> Unit,
    val openSettings: () -> Unit,
)

@Composable
fun rememberCameraPermissionState(): CameraPermissionState {
    val context = LocalContext.current

    fun isPermissionGranted(): Boolean =
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED

    var isGranted by remember(context) {
        mutableStateOf(isPermissionGranted())
    }
    var wasDenied by rememberSaveable {
        mutableStateOf(false)
    }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        isGranted = granted
        wasDenied = !granted
    }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        isGranted = isPermissionGranted()
        if (isGranted) {
            wasDenied = false
        }
    }

    return CameraPermissionState(
        isGranted = isGranted,
        wasDenied = wasDenied,
        requestPermission = {
            launcher.launch(Manifest.permission.CAMERA)
        },
        openSettings = {
            context.startActivity(
                Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    "package:${context.packageName}".toUri(),
                )
            )
        },
    )
}

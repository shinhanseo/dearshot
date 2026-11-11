package com.hanseo.dearshot.ui.photos

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.net.toUri
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.TextButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil3.compose.SubcomposeAsyncImage
import com.hanseo.dearshot.R
import com.hanseo.dearshot.data.local.photo.CapturedPhoto

@Composable
fun PhotoPreviewDialog(
    photos: List<CapturedPhoto>,
    initialPhotoId: String,
    saveStates: Map<String, PhotoGalleryUiState>,
    onPhotoOpened: (CapturedPhoto) -> Unit,
    onSave: (CapturedPhoto) -> Unit,
    onDismiss: () -> Unit,
) {
    if (photos.isEmpty()) return

    val initialPage = photos.indexOfFirst { it.id == initialPhotoId }.coerceAtLeast(0)
    val pagerState = rememberPagerState(initialPage = initialPage) { photos.size }
    val scope = rememberCoroutineScope()
    // 전환 애니메이션이 끝난 사진을 저장 대상으로 사용한다.
    val photo = photos[pagerState.settledPage]
    val currentOnPhotoOpened by rememberUpdatedState(onPhotoOpened)

    LaunchedEffect(photo.id) {
        currentOnPhotoOpened(photo)
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Surface(color = MaterialTheme.colorScheme.background) {
            Column(modifier = Modifier.fillMaxSize().safeDrawingPadding()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) {
                        Icon(
                            painterResource(R.drawable.ic_camera_expand_more),
                            contentDescription = stringResource(R.string.photo_list_back),
                            modifier = Modifier.size(24.dp).rotate(90f),
                        )
                    }
                    Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.Center) {
                        Text(
                            stringResource(R.string.photo_preview_position,
                                pagerState.settledPage + 1, photos.size),
                            style = MaterialTheme.typography.titleSmall,
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                        )
                    }
                    Spacer(modifier = Modifier.size(48.dp))
                }

                Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    HorizontalPager(
                        state = pagerState,
                        key = { photos[it].id },
                        modifier = Modifier.fillMaxSize(),
                    ) { page ->
                        SubcomposeAsyncImage(
                            model = photos[page].file,
                            contentDescription = stringResource(R.string.photo_list_photo_description, page + 1),
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize(),
                            error = {
                                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    Text(stringResource(R.string.photo_list_image_error))
                                }
                            },
                        )
                    }

                    PhotoPreviewArrow(
                        isPrevious = true,
                        enabled = pagerState.settledPage > 0 && !pagerState.isScrollInProgress,
                        onClick = {
                            scope.launch { pagerState.animateScrollToPage(pagerState.settledPage - 1) }
                        },
                        modifier = Modifier.align(Alignment.CenterStart).padding(start = 8.dp),
                    )
                    PhotoPreviewArrow(
                        isPrevious = false,
                        enabled = pagerState.settledPage < photos.lastIndex && !pagerState.isScrollInProgress,
                        onClick = {
                            scope.launch { pagerState.animateScrollToPage(pagerState.settledPage + 1) }
                        },
                        modifier = Modifier.align(Alignment.CenterEnd).padding(end = 8.dp),
                    )
                }

                PhotoGallerySaveControls(
                    photo = photo,
                    saveState = saveStates[photo.id] ?: PhotoGalleryUiState.Idle,
                    enabled = !pagerState.isScrollInProgress,
                    onSave = onSave,
                )
            }
        }
    }
}

@Composable
private fun PhotoPreviewArrow(
    isPrevious: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.85f),
    ) {
        IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.size(48.dp)) {
            Icon(
                painterResource(R.drawable.ic_camera_expand_more),
                contentDescription = stringResource(
                    if (isPrevious) R.string.photo_preview_previous else R.string.photo_preview_next,
                ),
                modifier = Modifier.size(24.dp).rotate(if (isPrevious) 90f else -90f),
            )
        }
    }
}

@Composable
private fun PhotoGallerySaveControls(
    photo: CapturedPhoto,
    saveState: PhotoGalleryUiState,
    enabled: Boolean,
    onSave: (CapturedPhoto) -> Unit,
) {
    val context = LocalContext.current
    val currentOnSave by rememberUpdatedState(onSave)
    var permissionDenied by rememberSaveable(photo.id) { mutableStateOf(false) }
    // 권한 창을 기다리는 동안 페이지가 바뀌어도, 저장을 누른 사진을 유지한다.
    var pendingPermissionPhoto by remember { mutableStateOf<CapturedPhoto?>(null) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        val requestedPhoto = pendingPermissionPhoto
        pendingPermissionPhoto = null
        permissionDenied = !granted
        if (granted && requestedPhoto != null) currentOnSave(requestedPhoto)
    }
    val isSaving = saveState == PhotoGalleryUiState.Saving
    val isSaved = saveState is PhotoGalleryUiState.Saved

    Column(
        modifier = Modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (permissionDenied || saveState == PhotoGalleryUiState.Error) {
            Text(
                text = stringResource(
                    if (permissionDenied) R.string.photo_gallery_permission_required
                    else R.string.photo_gallery_error,
                ),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        if (permissionDenied) {
            TextButton(onClick = {
                context.startActivity(Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    "package:${context.packageName}".toUri(),
                ))
            }) {
                Text(stringResource(R.string.photo_gallery_open_settings))
            }
        }
        Button(
            enabled = enabled && !isSaving && !isSaved && pendingPermissionPhoto == null,
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                val needsPermission = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
                    ContextCompat.checkSelfPermission(
                        context, Manifest.permission.WRITE_EXTERNAL_STORAGE,
                    ) != PackageManager.PERMISSION_GRANTED
                if (needsPermission) {
                    pendingPermissionPhoto = photo
                    permissionLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                } else {
                    permissionDenied = false
                    onSave(photo)
                }
            },
        ) {
            if (isSaving) {
                CircularProgressIndicator(
                    modifier = Modifier.padding(end = 8.dp).size(16.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary,
                )
            }
            Text(stringResource(when {
                isSaving -> R.string.photo_gallery_saving
                isSaved -> R.string.photo_gallery_saved
                saveState == PhotoGalleryUiState.Error -> R.string.photo_gallery_retry
                else -> R.string.photo_gallery_save
            }))
        }
    }
}

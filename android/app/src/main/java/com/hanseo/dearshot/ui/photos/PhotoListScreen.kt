package com.hanseo.dearshot.ui.photos

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import com.hanseo.dearshot.R
import com.hanseo.dearshot.data.local.photo.CapturedPhoto

@Composable
fun PhotoListScreen(
    uiState: PhotoListUiState,
    onBack: () -> Unit,
    onPhotoClick: (CapturedPhoto) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .safeDrawingPadding(),
        ) {
            PhotoListTopBar(
                onBack = onBack,
            )

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            ) {
                when (uiState) {
                    PhotoListUiState.Loading -> {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .align(Alignment.Center)
                                .size(32.dp),
                        )
                    }

                    is PhotoListUiState.Success -> {
                        if (uiState.photos.isEmpty()) {
                            PhotoListMessage(
                                message = stringResource(
                                    R.string.photo_list_empty,
                                ),
                            )
                        } else {
                            PhotoGrid(
                                photos = uiState.photos,
                                onPhotoClick = onPhotoClick,
                            )
                        }
                    }

                    PhotoListUiState.Error -> {
                        PhotoListMessage(
                            message = stringResource(
                                R.string.photo_list_error,
                            ),
                            onRetry = onRetry,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PhotoListTopBar(
    onBack: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                horizontal = 8.dp,
                vertical = 8.dp,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(
            onClick = onBack,
            modifier = Modifier.size(48.dp),
        ) {
            Icon(
                painter = painterResource(
                    R.drawable.ic_camera_expand_more,
                ),
                contentDescription = stringResource(
                    R.string.photo_list_back,
                ),
                modifier = Modifier
                    .size(24.dp)
                    .rotate(90f),
            )
        }

        Text(
            text = stringResource(R.string.photo_list_title),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier
                .weight(1f)
                .padding(horizontal = 8.dp),
        )
    }
}

@Composable
private fun PhotoGrid(
    photos: List<CapturedPhoto>,
    onPhotoClick: (CapturedPhoto) -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(3),
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = 8.dp,
            bottom = 24.dp,
        ),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        itemsIndexed(
            items = photos,
            key = { _, photo -> photo.id },
        ) { index, photo ->
            PhotoThumbnail(
                photo = photo,
                position = index + 1,
                onClick = {
                    onPhotoClick(photo)
                },
            )
        }
    }
}

@Composable
private fun PhotoThumbnail(
    photo: CapturedPhoto,
    position: Int,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(
                role = Role.Button,
                onClickLabel = stringResource(
                    R.string.photo_list_open_photo,
                ),
                onClick = onClick,
            ),
    ) {
        SubcomposeAsyncImage(
            model = photo.file,
            contentDescription = stringResource(
                R.string.photo_list_photo_description,
                position,
            ),
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
            error = {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        painter = painterResource(
                            R.drawable.ic_camera_gallery,
                        ),
                        contentDescription = stringResource(
                            R.string.photo_list_image_error,
                        ),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(24.dp),
                    )
                }
            },
        )
    }
}

@Composable
private fun PhotoListMessage(
    message: String,
    onRetry: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(
            space = 16.dp,
            alignment = Alignment.CenterVertically,
        ),
    ) {
        Icon(
            painter = painterResource(
                R.drawable.ic_camera_gallery,
            ),
            contentDescription = null,
            modifier = Modifier.size(40.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )

        if (onRetry != null) {
            TextButton(
                onClick = onRetry,
            ) {
                Text(
                    text = stringResource(
                        R.string.photo_list_retry,
                    ),
                )
            }
        }
    }
}
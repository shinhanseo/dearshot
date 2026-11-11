package com.hanseo.dearshot.ui.photos

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
    photo: CapturedPhoto,
    onDismiss: () -> Unit,
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
        ),
    ) {
        Surface(color = MaterialTheme.colorScheme.background) {
            Column(modifier = Modifier.fillMaxSize().safeDrawingPadding()) {
                IconButton(onClick = onDismiss, modifier = Modifier.size(48.dp)) {
                    Icon(
                        painterResource(R.drawable.ic_camera_expand_more),
                        contentDescription = stringResource(R.string.photo_list_back),
                        modifier = Modifier.size(24.dp).rotate(90f),
                    )
                }
                SubcomposeAsyncImage(
                    model = photo.file,
                    contentDescription = stringResource(R.string.photo_list_open_photo),
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.weight(1f).fillMaxSize(),
                    error = {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text(stringResource(R.string.photo_list_image_error))
                        }
                    },
                )
            }
        }
    }
}

package com.hanseo.dearshot.ui.camera.component

import android.util.Log
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import com.hanseo.dearshot.BuildConfig
import com.hanseo.dearshot.data.remote.template.TemplateGuideResponse

@Composable
fun CameraTemplateOverlay(
    guide: TemplateGuideResponse,
    modifier: Modifier = Modifier,
) {
    if (guide.type != "SVG_OVERLAY") return

    AsyncImage(
        model = guide.assetUrl,
        contentDescription = null,
        modifier = modifier,
        contentScale = ContentScale.Fit,
        onError = { state ->
            if (BuildConfig.DEBUG) {
                Log.w(
                    "CameraTemplateOverlay",
                    "Could not load the template guide",
                    state.result.throwable,
                )
            }
        },
    )
}

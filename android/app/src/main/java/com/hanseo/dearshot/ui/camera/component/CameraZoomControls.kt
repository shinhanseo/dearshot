package com.hanseo.dearshot.ui.camera.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.camera.CameraZoomInfo
import java.util.Locale
import kotlin.math.abs

@Composable
fun CameraZoomControls(
    zoomInfo: CameraZoomInfo,
    enabled: Boolean,
    onZoomSelected: (Float) -> Unit,
    modifier: Modifier = Modifier,
) {
    val options = remember(
        zoomInfo.minRatio,
        zoomInfo.maxRatio,
    ) {
        buildList {
            // 1배보다 넓게 볼 수 있는 카메라라면 최소 배율 추가.
            if (zoomInfo.minRatio < 1f) {
                add(zoomInfo.minRatio)
            }

            add(1f)
            add(2f)
        }
            .filter {
                it >= zoomInfo.minRatio &&
                        it <= zoomInfo.maxRatio
            }
            .distinct()
            .sorted()
    }

    // 선택지가 하나뿐이면 줌 조작부를 숨긴다.
    if (options.size < 2) return

    Surface(
        modifier = modifier,
        shape = CircleShape,
        color = Color.Black.copy(alpha = 0.65f),
    ) {
        Row(
            modifier = Modifier
                .selectableGroup()
                .padding(4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            options.forEach { ratio ->
                val selected =
                    abs(zoomInfo.ratio - ratio) < 0.01f

                Surface(
                    modifier = Modifier
                        .defaultMinSize(
                            minWidth = 48.dp,
                            minHeight = 36.dp,
                        )
                        .selectable(
                            selected = selected,
                            enabled = enabled,
                            role = Role.RadioButton,
                            onClick = {
                                onZoomSelected(ratio)
                            },
                        ),
                    shape = CircleShape,
                    color = if (selected) {
                        MaterialTheme.colorScheme.background
                    } else {
                        Color.Transparent
                    },
                ) {
                    androidx.compose.foundation.layout.Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier.padding(
                            horizontal = 8.dp
                        ),
                    ) {
                        Text(
                            text = zoomLabel(ratio),
                            style =
                                MaterialTheme.typography.labelLarge,
                            color = if (selected) {
                                MaterialTheme.colorScheme.onBackground
                            } else {
                                Color.White.copy(
                                    alpha = if (enabled) 1f else 0.38f
                                )
                            },
                        )
                    }
                }
            }
        }
    }
}

private fun zoomLabel(ratio: Float): String {
    val number = if (ratio == ratio.toInt().toFloat()) {
        ratio.toInt().toString()
    } else {
        String.format(Locale.ROOT, "%.1f", ratio)
    }

    return "${number}×"
}
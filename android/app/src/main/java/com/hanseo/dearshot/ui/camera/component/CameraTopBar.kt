package com.hanseo.dearshot.ui.camera.component

import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.R
import com.hanseo.dearshot.ui.theme.DearShotTheme

@Composable
fun CameraTopBar(
    placeName: String?,
    templateName: String?,
    flashEnabled: Boolean,
    flashAvailable: Boolean,
    onFlashChange: (Boolean) -> Unit,
    onCompositionClick: () -> Unit,
    onMyPageClick: () -> Unit,
    modifier: Modifier = Modifier,
    recommendationCount: Int = 0,
    selectedIndex: Int = 0,
    isSwitching: Boolean = false,
    onPreviousRecommendation: () -> Unit = {},
    onNextRecommendation: () -> Unit = {},
) {
    val hasRecommendations = recommendationCount > 0
    val showNavigation = recommendationCount > 1

    val previousEnabled =
        showNavigation && selectedIndex > 0 && !isSwitching

    val nextEnabled =
        showNavigation &&
                selectedIndex < recommendationCount - 1 &&
                !isSwitching

    val currentOnPrevious by rememberUpdatedState(
        onPreviousRecommendation,
    )

    val currentOnNext by rememberUpdatedState(
        onNextRecommendation,
    )

    val swipeThresholdPx = with(LocalDensity.current) {
        36.dp.toPx()
    }

    val swipeModifier = if (showNavigation) {
        Modifier.pointerInput(
            previousEnabled,
            nextEnabled,
            swipeThresholdPx,
        ) {
            var dragDistance = 0f

            detectHorizontalDragGestures(
                onDragStart = {
                    dragDistance = 0f
                },
                onHorizontalDrag = { change, dragAmount ->
                    change.consume()
                    dragDistance += dragAmount
                },
                onDragEnd = {
                    when {
                        dragDistance <= -swipeThresholdPx &&
                                nextEnabled -> {
                            currentOnNext()
                        }

                        dragDistance >= swipeThresholdPx &&
                                previousEnabled -> {
                            currentOnPrevious()
                        }
                    }

                    dragDistance = 0f
                },
                onDragCancel = {
                    dragDistance = 0f
                },
            )
        }
    } else {
        Modifier
    }

    val flashStateDescription = stringResource(
        if (flashEnabled) {
            R.string.camera_flash_on
        } else {
            R.string.camera_flash_off
        },
    )

    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 64.dp)
                .padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconToggleButton(
                checked = flashEnabled,
                onCheckedChange = onFlashChange,
                enabled = flashAvailable,
                modifier = Modifier
                    .size(48.dp)
                    .semantics {
                        stateDescription = flashStateDescription
                    },
            ) {
                Icon(
                    painter = painterResource(
                        R.drawable.ic_camera_flash,
                    ),
                    contentDescription = stringResource(
                        R.string.camera_flash,
                    ),
                    modifier = Modifier.size(24.dp),
                    tint = when {
                        !flashAvailable -> {
                            MaterialTheme.colorScheme.onSurface
                                .copy(alpha = 0.38f)
                        }

                        flashEnabled -> {
                            MaterialTheme.colorScheme.primary
                        }

                        else -> {
                            MaterialTheme.colorScheme.onSurface
                        }
                    },
                )
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .then(swipeModifier),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = placeName
                        ?: stringResource(R.string.camera_brand),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center,
                ) {
                    if (showNavigation) {
                        RecommendationArrow(
                            isPrevious = true,
                            enabled = previousEnabled,
                            onClick = onPreviousRecommendation,
                        )
                    }

                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = 48.dp)
                            .clickable(
                                enabled = !isSwitching,
                                role = Role.Button,
                                onClickLabel = stringResource(
                                    R.string.camera_open_composition_picker,
                                ),
                                onClick = onCompositionClick,
                            ),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(
                            space = 4.dp,
                            alignment = Alignment.CenterHorizontally,
                        ),
                    ) {
                        Text(
                            text = templateName
                                ?: stringResource(
                                    R.string.camera_choose_composition,
                                ),
                            modifier = Modifier.weight(
                                weight = 1f,
                                fill = false,
                            ),
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )

                        when {
                            isSwitching -> {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(14.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }

                            hasRecommendations -> {
                                Text(
                                    text = stringResource(
                                        R.string.camera_recommendation_position,
                                        selectedIndex + 1,
                                        recommendationCount,
                                    ),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }

                            else -> {
                                Icon(
                                    painter = painterResource(
                                        R.drawable.ic_camera_expand_more,
                                    ),
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                    tint = MaterialTheme.colorScheme.onSurface,
                                )
                            }
                        }
                    }

                    if (showNavigation) {
                        RecommendationArrow(
                            isPrevious = false,
                            enabled = nextEnabled,
                            onClick = onNextRecommendation,
                        )
                    }
                }
            }

            IconButton(
                onClick = onMyPageClick,
                modifier = Modifier.size(48.dp),
            ) {
                Icon(
                    painter = painterResource(
                        R.drawable.ic_camera_profile,
                    ),
                    contentDescription = stringResource(
                        R.string.camera_open_my_page,
                    ),
                    modifier = Modifier.size(24.dp),
                    tint = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

@Composable
private fun RecommendationArrow(
    isPrevious: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.size(48.dp),
    ) {
        Icon(
            painter = painterResource(
                R.drawable.ic_camera_expand_more,
            ),
            contentDescription = stringResource(
                if (isPrevious) {
                    R.string.camera_previous_recommendation
                } else {
                    R.string.camera_next_recommendation
                },
            ),
            modifier = Modifier
                .size(20.dp)
                .rotate(
                    if (isPrevious) 90f else -90f,
                ),
            tint = MaterialTheme.colorScheme.primary.copy(
                alpha = if (enabled) 1f else 0.25f,
            ),
        )
    }
}

@Preview(
    name = "Three recommendations",
    widthDp = 390,
    showBackground = true,
)
@Composable
private fun CameraTopBarRecommendationsPreview() {
    DearShotTheme {
        CameraTopBar(
            placeName = null,
            templateName = "테라스의 여유",
            flashEnabled = false,
            flashAvailable = true,
            onFlashChange = {},
            onCompositionClick = {},
            onMyPageClick = {},
            recommendationCount = 3,
            selectedIndex = 0,
        )
    }
}

@Preview(
    name = "Before recommendation",
    widthDp = 390,
    showBackground = true,
)
@Composable
private fun CameraTopBarBeforeRecommendationPreview() {
    DearShotTheme {
        CameraTopBar(
            placeName = null,
            templateName = null,
            flashEnabled = false,
            flashAvailable = false,
            onFlashChange = {},
            onCompositionClick = {},
            onMyPageClick = {},
        )
    }
}
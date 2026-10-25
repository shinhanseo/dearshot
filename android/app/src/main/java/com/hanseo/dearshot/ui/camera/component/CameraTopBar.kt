package com.hanseo.dearshot.ui.camera.component

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
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
) {
    val pickerDescription = stringResource(
        R.string.camera_open_composition_picker
    )

    val flashStateDescription = stringResource(
        if (flashEnabled) {
            R.string.camera_flash_on
        } else {
            R.string.camera_flash_off
        }
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
                        R.drawable.ic_camera_flash
                    ),
                    contentDescription = stringResource(
                        R.string.camera_flash
                    ),
                    modifier = Modifier.size(24.dp),
                    tint = when {
                        !flashAvailable ->
                            MaterialTheme.colorScheme.onSurface
                                .copy(alpha = 0.38f)

                        flashEnabled ->
                            MaterialTheme.colorScheme.primary

                        else ->
                            MaterialTheme.colorScheme.onSurface
                    },
                )
            }

            Column(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .clickable(
                        role = Role.Button,
                        onClick = onCompositionClick,
                    )
                    .semantics {
                        contentDescription = pickerDescription
                    }
                    .padding(
                        horizontal = 8.dp,
                        vertical = 4.dp,
                    ),
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
                    textAlign = TextAlign.Center,
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(
                        4.dp
                    ),
                ) {
                    Text(
                        text = templateName
                            ?: stringResource(
                                R.string.camera_choose_composition
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

                    Icon(
                        painter = painterResource(
                            R.drawable.ic_camera_expand_more
                        ),
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }

            IconButton(
                onClick = onMyPageClick,
                modifier = Modifier.size(48.dp),
            ) {
                Icon(
                    painter = painterResource(
                        R.drawable.ic_camera_profile
                    ),
                    contentDescription = stringResource(
                        R.string.camera_open_my_page
                    ),
                    modifier = Modifier.size(24.dp),
                )
            }
        }
    }
}

@Preview(
    name = "Selected composition",
    widthDp = 390,
    showBackground = true,
)
@Composable
private fun CameraTopBarSelectedPreview() {
    DearShotTheme {
        CameraTopBar(
            placeName = "바다",
            templateName = "바람을 느끼는 순간",
            flashEnabled = false,
            flashAvailable = true,
            onFlashChange = {},
            onCompositionClick = {},
            onMyPageClick = {},
        )
    }
}

@Preview(
    name = "Before selection",
    widthDp = 390,
    showBackground = true,
)
@Composable
private fun CameraTopBarUnselectedPreview() {
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
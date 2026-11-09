package com.hanseo.dearshot.ui.camera.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.hanseo.dearshot.R
import com.hanseo.dearshot.data.remote.template.TemplateSummaryResponse

@Composable
fun CameraTemplatePreviewDialog(
    template: TemplateSummaryResponse,
    isApplying: Boolean,
    hasError: Boolean,
    onApply: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = { if (!isApplying) onDismiss() },
        title = { Text(template.title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AsyncImage(
                    model = template.previewUrl,
                    contentDescription = template.title,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 360.dp),
                )
                Text(template.summary)
                if (hasError) {
                    Text(
                        stringResource(R.string.template_selection_apply_error),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onApply, enabled = !isApplying) {
                Text(stringResource(
                    if (isApplying) R.string.template_selection_applying
                    else R.string.template_selection_apply,
                ))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isApplying) {
                Text(stringResource(R.string.template_selection_back_to_list))
            }
        },
    )
}

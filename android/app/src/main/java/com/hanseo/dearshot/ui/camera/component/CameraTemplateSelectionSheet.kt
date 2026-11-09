package com.hanseo.dearshot.ui.camera.component

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.hanseo.dearshot.R
import com.hanseo.dearshot.data.remote.template.TemplateSummaryResponse
import com.hanseo.dearshot.ui.camera.TemplateSelectionUiState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CameraTemplateSelectionSheet(
    uiState: TemplateSelectionUiState,
    onTemplateClick: (TemplateSummaryResponse) -> Unit,
    onRetry: () -> Unit,
    onLoadMore: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
    )

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(
                text = stringResource(
                    R.string.template_selection_title,
                ),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(
                    horizontal = 24.dp,
                    vertical = 12.dp,
                ),
            )

            when (uiState) {
                TemplateSelectionUiState.Idle,
                TemplateSelectionUiState.Loading -> {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 220.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(32.dp),
                        )
                    }
                }

                is TemplateSelectionUiState.Error -> {
                    TemplateSelectionMessage(
                        message = stringResource(
                            R.string.template_selection_error,
                        ),
                        onRetry = onRetry,
                    )
                }

                is TemplateSelectionUiState.Success -> {
                    if (uiState.templates.isEmpty()) {
                        TemplateSelectionMessage(
                            message = stringResource(
                                R.string.template_selection_empty,
                            ),
                        )
                    } else {
                        TemplateSelectionGrid(
                            state = uiState,
                            onTemplateClick = onTemplateClick,
                            onLoadMore = onLoadMore,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TemplateSelectionGrid(
    state: TemplateSelectionUiState.Success,
    onTemplateClick: (TemplateSummaryResponse) -> Unit,
    onLoadMore: () -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 520.dp),
        contentPadding = PaddingValues(
            start = 24.dp,
            end = 24.dp,
            top = 8.dp,
            bottom = 24.dp,
        ),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        items(
            items = state.templates,
            key = { it.id },
        ) { template ->
            TemplateSelectionItem(
                template = template,
                onClick = {
                    onTemplateClick(template)
                },
            )
        }

        item(
            span = { GridItemSpan(maxLineSpan) },
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (state.loadMoreError != null) {
                    Text(
                        text = stringResource(
                            R.string.template_selection_more_error,
                        ),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                if (state.isLoadingMore) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                    )
                } else if (state.hasNext) {
                    TextButton(
                        onClick = onLoadMore,
                    ) {
                        Text(
                            text = stringResource(
                                if (state.loadMoreError != null) {
                                    R.string.template_selection_retry
                                } else {
                                    R.string.template_selection_more
                                },
                            ),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TemplateSelectionItem(
    template: TemplateSummaryResponse,
    onClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .clip(MaterialTheme.shapes.medium)
            .clickable(
                onClickLabel = stringResource(
                    R.string.template_selection_preview,
                ),
                onClick = onClick,
            ),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AsyncImage(
            model = template.thumbnailUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    Modifier.aspectRatio(3f / 4f),
                )
                .clip(MaterialTheme.shapes.medium),
        )

        Text(
            text = template.title,
            style = MaterialTheme.typography.titleSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )

        Text(
            text = template.summary,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun TemplateSelectionMessage(
    message: String,
    onRetry: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(24.dp)
            .heightIn(min = 180.dp),
        verticalArrangement = Arrangement.spacedBy(
            space = 16.dp,
            alignment = Alignment.CenterVertically,
        ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
        )

        if (onRetry != null) {
            Button(
                onClick = onRetry,
            ) {
                Text(
                    text = stringResource(
                        R.string.template_selection_retry,
                    ),
                )
            }
        }
    }
}
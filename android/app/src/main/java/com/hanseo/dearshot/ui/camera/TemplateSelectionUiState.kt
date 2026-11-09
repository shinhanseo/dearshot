package com.hanseo.dearshot.ui.camera

import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.data.remote.template.TemplateSummaryResponse

sealed interface TemplateSelectionUiState {
    data object Idle: TemplateSelectionUiState

    data object Loading: TemplateSelectionUiState

    data class Success(
        val templates: List<TemplateSummaryResponse>,
        val nextCursor: String?,
        val hasNext: Boolean,
        val isLoadingMore: Boolean = false,
        val loadMoreError: ApiFailure? = null,
    ) : TemplateSelectionUiState

    data class Error(
        val failure: ApiFailure
    ) : TemplateSelectionUiState
}
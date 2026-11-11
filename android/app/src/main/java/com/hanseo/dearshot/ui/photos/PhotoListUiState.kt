package com.hanseo.dearshot.ui.photos

import com.hanseo.dearshot.data.local.photo.CapturedPhoto

sealed interface PhotoListUiState {
    data object Loading: PhotoListUiState

    data class Success(
        val photos: List<CapturedPhoto>,
    ) : PhotoListUiState

    data object Error: PhotoListUiState
}
package com.hanseo.dearshot.ui.photos

import android.net.Uri

sealed interface PhotoGalleryUiState {
    data object Idle : PhotoGalleryUiState
    data object Saving : PhotoGalleryUiState
    data class Saved(val uri: Uri) : PhotoGalleryUiState
    data object Error : PhotoGalleryUiState
}

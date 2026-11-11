package com.hanseo.dearshot.ui.photos

import androidx.annotation.MainThread
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hanseo.dearshot.data.local.photo.CapturedPhoto
import com.hanseo.dearshot.data.repository.PhotoGalleryRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class PhotoGalleryViewModel @Inject constructor(
    private val galleryRepository: PhotoGalleryRepository,
) : ViewModel() {
    private val _saveStates =
        MutableStateFlow<Map<String, PhotoGalleryUiState>>(emptyMap())
    val saveStates = _saveStates.asStateFlow()

    @MainThread
    fun onPhotoOpened(photo: CapturedPhoto) {
        galleryRepository.getSavedUri(photo.id)?.let { uri ->
            updateState(photo.id, PhotoGalleryUiState.Saved(uri))
        }
    }

    @MainThread
    fun savePhoto(photo: CapturedPhoto) {
        val current = _saveStates.value[photo.id]
        if (current == PhotoGalleryUiState.Saving || current is PhotoGalleryUiState.Saved) return

        updateState(photo.id, PhotoGalleryUiState.Saving)
        viewModelScope.launch {
            try {
                val uri = galleryRepository.savePhoto(photo)
                updateState(photo.id, PhotoGalleryUiState.Saved(uri))
            } catch (exception: CancellationException) {
                updateState(photo.id, PhotoGalleryUiState.Idle)
                throw exception
            } catch (_: Exception) {
                updateState(photo.id, PhotoGalleryUiState.Error)
            }
        }
    }

    private fun updateState(photoId: String, state: PhotoGalleryUiState) {
        _saveStates.update { it + (photoId to state) }
    }
}

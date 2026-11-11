package com.hanseo.dearshot.ui.photos

import androidx.annotation.MainThread
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hanseo.dearshot.data.repository.CapturedPhotoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class PhotoListViewModel @Inject constructor(
    private val photoRepository: CapturedPhotoRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow<PhotoListUiState>(
        PhotoListUiState.Loading
    )

    val uiState = _uiState.asStateFlow()

    private var loadJob: Job? = null

    init {
        refresh()
    }

    @MainThread
    fun refresh() {
        // 이전 조회가 남아 있다면 취소하고 새로 조회한다.
        loadJob?.cancel()

        _uiState.value = PhotoListUiState.Loading

        loadJob = viewModelScope.launch {
            try {
                val photos = photoRepository.getPhotos()

                // 취소된 이전 조회가 새 화면 상태를 덮어쓰지 않게 한다.
                ensureActive()

                _uiState.value = PhotoListUiState.Success(
                    photos = photos,
                )
            } catch (exception: CancellationException) {
                // 화면 종료나 새 조회로 인한 취소는 오류로 표시하지 않는다.
                throw exception
            } catch (_: Exception) {
                ensureActive()

                _uiState.value = PhotoListUiState.Error
            }
        }
    }
}
package com.hanseo.dearshot.ui.camera

import androidx.annotation.MainThread
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hanseo.dearshot.data.device.AppInfoProvider
import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.repository.TemplateRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class TemplateSelectionViewModel @Inject constructor(
    private val templateRepository: TemplateRepository,
    private val appInfoProvider: AppInfoProvider,
) : ViewModel() {

    private val _uiState =
        MutableStateFlow<TemplateSelectionUiState>(
            TemplateSelectionUiState.Idle,
        )

    val uiState = _uiState.asStateFlow()

    private var requestJob: Job? = null

    // 재시도와 다음 페이지 조회에 사용할 검색 조건.
    private var currentQuery: TemplateQuery? = null

    @MainThread
    fun loadTemplates(scene: String? = null) {
        val query = TemplateQuery(
            scene = scene,
            locale = appInfoProvider.getLocale(),
        )

        currentQuery = query
        loadFirstPage(query)
    }

    @MainThread
    fun retry() {
        if (_uiState.value !is TemplateSelectionUiState.Error) {
            return
        }

        val query = currentQuery ?: return
        loadFirstPage(query)
    }

    private fun loadFirstPage(query: TemplateQuery) {
        // 장소를 바꾸면 이전 목록 요청은 취소한다.
        requestJob?.cancel()

        _uiState.value = TemplateSelectionUiState.Loading

        requestJob = viewModelScope.launch {
            val result = templateRepository.getTemplates(
                locale = query.locale,
                scene = query.scene,
                limit = PAGE_SIZE,
            )

            // 취소된 이전 요청이 화면 상태를 변경하지 못하게 한다.
            ensureActive()

            _uiState.value = when (result) {
                is ApiResult.Success -> {
                    val page = result.data

                    TemplateSelectionUiState.Success(
                        templates = page.items,
                        nextCursor = page.nextCursor,
                        hasNext = page.hasNext,
                    )
                }

                is ApiResult.Failure -> {
                    TemplateSelectionUiState.Error(
                        failure = result.error,
                    )
                }
            }
        }
    }

    @MainThread
    fun loadMore() {
        val state =
            _uiState.value as? TemplateSelectionUiState.Success
                ?: return

        if (!state.hasNext || state.isLoadingMore) {
            return
        }

        val cursor = state.nextCursor ?: return
        val query = currentQuery ?: return

        // 기존 목록을 유지한 채 추가 로딩 상태만 변경한다.
        _uiState.value = state.copy(
            isLoadingMore = true,
            loadMoreError = null,
        )

        requestJob = viewModelScope.launch {
            val result = templateRepository.getTemplates(
                locale = query.locale,
                scene = query.scene,
                cursor = cursor,
                limit = PAGE_SIZE,
            )

            ensureActive()

            _uiState.value = when (result) {
                is ApiResult.Success -> {
                    val page = result.data

                    state.copy(
                        templates = (
                                state.templates + page.items
                                ).distinctBy { it.id },
                        nextCursor = page.nextCursor,
                        hasNext = page.hasNext,
                        isLoadingMore = false,
                        loadMoreError = null,
                    )
                }

                is ApiResult.Failure -> {
                    state.copy(
                        isLoadingMore = false,
                        loadMoreError = result.error,
                    )
                }
            }
        }
    }

    private data class TemplateQuery(
        val scene: String?,
        val locale: String,
    )

    private companion object {
        const val PAGE_SIZE = 20
    }
}
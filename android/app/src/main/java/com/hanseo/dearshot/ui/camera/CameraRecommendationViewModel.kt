package com.hanseo.dearshot.ui.camera

import androidx.annotation.MainThread
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hanseo.dearshot.analysis.recommendation.RecommendationSnapshot
import com.hanseo.dearshot.data.device.AppInfoProvider
import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.remote.scene.SceneAnalysisStatusResponse
import com.hanseo.dearshot.data.remote.scene.SceneRecommendation
import com.hanseo.dearshot.data.remote.template.TemplateDetailResponse
import com.hanseo.dearshot.data.repository.TemplateRepository
import com.hanseo.dearshot.domain.recommendation.RequestSceneRecommendationUseCase
import com.hanseo.dearshot.domain.recommendation.SceneRecommendationResult
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ManualTemplateUiState(
    val template: TemplateDetailResponse? = null,
    val isApplying: Boolean = false,
    val applicationVersion: Long = 0,
    val error: ApiFailure? = null,
)

sealed interface CameraRecommendationUiState {

    data object Idle : CameraRecommendationUiState

    data object Loading : CameraRecommendationUiState

    data class Finished(
        val response: SceneAnalysisStatusResponse,
        val template: TemplateDetailResponse? = null,
        val recommendations: List<SceneRecommendation> = emptyList(),
        val selectedIndex: Int = 0,
        val isSwitching: Boolean = false,
        val switchError: ApiFailure? = null,
        val locale: String = "",
    ) : CameraRecommendationUiState

    data class RequestFailed(
        val error: ApiFailure,
    ) : CameraRecommendationUiState

    data class TimedOut(
        val analysisId: String,
    ) : CameraRecommendationUiState
}

@HiltViewModel
class CameraRecommendationViewModel @Inject constructor(
    private val requestRecommendation: RequestSceneRecommendationUseCase,
    private val appInfoProvider: AppInfoProvider,
    private val templateRepository: TemplateRepository,
) : ViewModel() {

    private val _uiState =
        MutableStateFlow<CameraRecommendationUiState>(
            CameraRecommendationUiState.Idle,
        )

    val uiState = _uiState.asStateFlow()

    private val _manualTemplateState =
        MutableStateFlow(ManualTemplateUiState())

    val manualTemplateState = _manualTemplateState.asStateFlow()

    private var requestJob: Job? = null
    private var applyJob: Job? = null
    private var switchJob: Job? = null

    private var lastSnapshotId: String? = null
    private var sceneRevision = 0

    private data class TemplateCacheKey(
        val id: String,
        val version: Int,
        val locale: String,
    )

    private val templateCache =
        mutableMapOf<TemplateCacheKey, TemplateDetailResponse>()

    @MainThread
    fun onSnapshotReady(snapshot: RecommendationSnapshot) {
        if (
            _manualTemplateState.value.template != null ||
            _manualTemplateState.value.isApplying ||
            requestJob?.isActive == true ||
            lastSnapshotId == snapshot.id
        ) {
            return
        }

        switchJob?.cancel()
        switchJob = null
        templateCache.clear()

        lastSnapshotId = snapshot.id

        val revision = ++sceneRevision

        _uiState.value = CameraRecommendationUiState.Loading

        requestJob = viewModelScope.launch {
            val locale = appInfoProvider.getLocale()

            val result = try {
                requestRecommendation.request(
                    snapshot = snapshot,
                    sceneRevision = revision,
                    locale = locale,
                )
            } catch (_: IllegalArgumentException) {
                ensureActive()

                _uiState.value =
                    CameraRecommendationUiState.RequestFailed(
                        error = ApiFailure.Unexpected,
                    )

                return@launch
            }

            ensureActive()

            val nextState = when (result) {
                is SceneRecommendationResult.Finished -> {
                    resolveFinished(
                        response = result.response,
                        locale = locale,
                    )
                }

                is SceneRecommendationResult.RequestFailed -> {
                    CameraRecommendationUiState.RequestFailed(
                        error = result.error,
                    )
                }

                is SceneRecommendationResult.PollingTimedOut -> {
                    CameraRecommendationUiState.TimedOut(
                        analysisId = result.analysisId,
                    )
                }
            }

            ensureActive()

            _uiState.value = nextState
        }
    }

    /**
     * 분석기의 추천 잠금을 초기화한 다음 호출한다.
     */
    @MainThread
    fun prepareForRetry() {
        if (_uiState.value == CameraRecommendationUiState.Loading) {
            return
        }

        switchJob?.cancel()
        switchJob = null

        applyJob?.cancel()
        applyJob = null

        requestJob?.cancel()
        requestJob = null

        templateCache.clear()
        lastSnapshotId = null

        _manualTemplateState.value = ManualTemplateUiState()
        _uiState.value = CameraRecommendationUiState.Idle
    }

    private suspend fun resolveFinished(
        response: SceneAnalysisStatusResponse,
        locale: String,
    ): CameraRecommendationUiState {
        if (response.status != "COMPLETED") {
            return CameraRecommendationUiState.Finished(
                response = response,
            )
        }

        val result = response.result
            ?: return CameraRecommendationUiState.RequestFailed(
                error = ApiFailure.Unexpected,
            )

        val recommendations = result.recommendations
            .ifEmpty {
                listOfNotNull(result.recommendation)
            }
            .distinctBy { it.template.id }
            .take(3)

        val first = recommendations.firstOrNull()
            ?: return CameraRecommendationUiState.RequestFailed(
                error = ApiFailure.Unexpected,
            )

        val detail = templateRepository.getDetail(
            templateId = first.template.id,
            version = first.template.version,
            locale = locale,
        )

        // 취소된 요청이 캐시나 화면 상태를 변경하지 않게 한다.
        kotlinx.coroutines.currentCoroutineContext().ensureActive()

        return when (detail) {
            is ApiResult.Success -> {
                val cacheKey = TemplateCacheKey(
                    id = first.template.id,
                    version = first.template.version,
                    locale = locale,
                )

                templateCache[cacheKey] = detail.data

                CameraRecommendationUiState.Finished(
                    response = response,
                    template = detail.data,
                    recommendations = recommendations,
                    selectedIndex = 0,
                    locale = locale,
                )
            }

            is ApiResult.Failure -> {
                CameraRecommendationUiState.RequestFailed(
                    error = detail.error,
                )
            }
        }
    }

    @MainThread
    fun selectPreviousRecommendation() {
        val state =
            _uiState.value as? CameraRecommendationUiState.Finished
                ?: return

        selectRecommendation(state.selectedIndex - 1)
    }

    @MainThread
    fun selectNextRecommendation() {
        val state =
            _uiState.value as? CameraRecommendationUiState.Finished
                ?: return

        selectRecommendation(state.selectedIndex + 1)
    }

    @MainThread
    fun selectRecommendation(index: Int) {
        val state =
            _uiState.value as? CameraRecommendationUiState.Finished
                ?: return

        if (
            _manualTemplateState.value.isApplying ||
            _manualTemplateState.value.template != null ||
            state.isSwitching
        ) {
            return
        }

        if (
            index !in state.recommendations.indices ||
            index == state.selectedIndex
        ) {
            return
        }

        val target = state.recommendations[index].template

        val cacheKey = TemplateCacheKey(
            id = target.id,
            version = target.version,
            locale = state.locale,
        )

        val cached = templateCache[cacheKey]

        if (cached != null) {
            _uiState.value = state.copy(
                template = cached,
                selectedIndex = index,
                isSwitching = false,
                switchError = null,
            )

            return
        }

        val switchingState = state.copy(
            isSwitching = true,
            switchError = null,
        )

        _uiState.value = switchingState

        switchJob = viewModelScope.launch {
            val result = templateRepository.getDetail(
                templateId = target.id,
                version = target.version,
                locale = state.locale,
            )

            ensureActive()

            if (_uiState.value != switchingState) {
                return@launch
            }

            _uiState.value = when (result) {
                is ApiResult.Success -> {
                    templateCache[cacheKey] = result.data

                    state.copy(
                        template = result.data,
                        selectedIndex = index,
                        isSwitching = false,
                        switchError = null,
                    )
                }

                is ApiResult.Failure -> {
                    // 기존 구도는 유지하고 전환 오류만 표시한다.
                    state.copy(
                        isSwitching = false,
                        switchError = result.error,
                    )
                }
            }
        }
    }

    @MainThread
    fun clearRecommendationSwitchError() {
        val state =
            _uiState.value as? CameraRecommendationUiState.Finished
                ?: return

        _uiState.value = state.copy(
            switchError = null,
        )
    }

    @MainThread
    fun applyTemplate(
        templateId: String,
        version: Int,
    ) {
        if (_manualTemplateState.value.isApplying) {
            return
        }

        _manualTemplateState.value =
            _manualTemplateState.value.copy(
                isApplying = true,
                error = null,
            )

        applyJob = viewModelScope.launch {
            val result = templateRepository.getDetail(
                templateId = templateId,
                version = version,
                locale = appInfoProvider.getLocale(),
            )

            ensureActive()

            when (result) {
                is ApiResult.Success -> {
                    switchJob?.cancel()
                    switchJob = null

                    requestJob?.cancel()
                    requestJob = null

                    templateCache.clear()

                    _manualTemplateState.value =
                        ManualTemplateUiState(
                            template = result.data,
                            applicationVersion =
                                _manualTemplateState.value.applicationVersion + 1,
                        )

                    _uiState.value = CameraRecommendationUiState.Idle
                }

                is ApiResult.Failure -> {
                    _manualTemplateState.value =
                        _manualTemplateState.value.copy(
                            isApplying = false,
                            error = result.error,
                        )
                }
            }
        }
    }

    @MainThread
    fun clearTemplateApplyError() {
        _manualTemplateState.value =
            _manualTemplateState.value.copy(
                error = null,
            )
    }
}
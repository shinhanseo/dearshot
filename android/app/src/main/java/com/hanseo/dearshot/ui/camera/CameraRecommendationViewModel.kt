package com.hanseo.dearshot.ui.camera

import androidx.annotation.MainThread
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hanseo.dearshot.analysis.recommendation.RecommendationSnapshot
import com.hanseo.dearshot.data.device.AppInfoProvider
import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.data.remote.scene.SceneAnalysisStatusResponse
import com.hanseo.dearshot.domain.recommendation.RequestSceneRecommendationUseCase
import com.hanseo.dearshot.domain.recommendation.SceneRecommendationResult
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.remote.template.TemplateDetailResponse
import com.hanseo.dearshot.data.repository.TemplateRepository

sealed interface CameraRecommendationUiState {
    data object Idle: CameraRecommendationUiState
    data object Loading: CameraRecommendationUiState

    data class Finished(
        val response: SceneAnalysisStatusResponse,
        val template: TemplateDetailResponse? = null,
    ) : CameraRecommendationUiState

    data class RequestFailed(
        val error: ApiFailure
    ) : CameraRecommendationUiState

    data class TimedOut(
        val analysisId: String
    ) : CameraRecommendationUiState
}

@HiltViewModel
class CameraRecommendationViewModel @Inject constructor(
    private val requestRecommendation: RequestSceneRecommendationUseCase,
    private val appInfoProvider: AppInfoProvider,
    private val templateRepository: TemplateRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow<CameraRecommendationUiState>(
        CameraRecommendationUiState.Idle
    )

    val uiState = _uiState.asStateFlow()

    private var requestJob: Job? = null
    private var lastSnapshotId: String? = null
    private var sceneRevision = 0

    @MainThread
    fun onSnapshotReady(snapshot: RecommendationSnapshot) {
        if (requestJob?.isActive == true || lastSnapshotId == snapshot.id) {
            return
        }

        lastSnapshotId = snapshot.id

        val revision = ++sceneRevision

        _uiState.value = CameraRecommendationUiState.Loading

        requestJob = viewModelScope.launch {
            val locale = appInfoProvider.getLocale()

            val result = try {
                requestRecommendation.request(
                    snapshot = snapshot,
                    sceneRevision = revision,
                    locale = locale
                )
            } catch (_: IllegalArgumentException) {
                _uiState.value = CameraRecommendationUiState.RequestFailed(
                    ApiFailure.Unexpected
                )
                return@launch
            }

            _uiState.value = when (result) {
                is SceneRecommendationResult.Finished -> resolveFinished(result.response, locale)

                is SceneRecommendationResult.RequestFailed -> CameraRecommendationUiState.RequestFailed(result.error)

                is SceneRecommendationResult.PollingTimedOut -> CameraRecommendationUiState.TimedOut(result.analysisId)
            }
        }
    }

    /**
     * 이전 추천 결과를 비우고 새 스냅샷을 받을 준비를 한다.
     *
     * 카메라 분석 쪽의 추천 잠금 초기화는 별도로 필요하다.
     */
    @MainThread
    fun prepareForRetry() {
        // 이미 요청 중이면 중복 재시도를 막는다.
        if (_uiState.value == CameraRecommendationUiState.Loading) {
            return
        }

        requestJob?.cancel()
        requestJob = null

        lastSnapshotId = null

        _uiState.value = CameraRecommendationUiState.Idle
    }

    private suspend fun resolveFinished(
        response: SceneAnalysisStatusResponse,
        locale: String,
    ): CameraRecommendationUiState {
        if (response.status != "COMPLETED") {
            return CameraRecommendationUiState.Finished(response)
        }

        val templateRef = response.result?.recommendation?.template
            ?: return CameraRecommendationUiState.RequestFailed(ApiFailure.Unexpected)

        return when (
            val detail = templateRepository.getDetail(
                templateId = templateRef.id,
                version = templateRef.version,
                locale = locale,
            )
        ) {
            is ApiResult.Success -> CameraRecommendationUiState.Finished(
                response = response,
                template = detail.data,
            )

            is ApiResult.Failure ->
                CameraRecommendationUiState.RequestFailed(detail.error)
        }
    }
}
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

sealed interface CameraRecommendationUiState {
    data object Idle: CameraRecommendationUiState
    data object Loading: CameraRecommendationUiState

    data class Finished(
        val response: SceneAnalysisStatusResponse
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
    private val appInfoProvider: AppInfoProvider
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
            val result = try {
                requestRecommendation.request(
                    snapshot = snapshot,
                    sceneRevision = revision,
                    locale = appInfoProvider.getLocale()
                )
            } catch (_: IllegalArgumentException) {
                _uiState.value = CameraRecommendationUiState.RequestFailed(
                    ApiFailure.Unexpected
                )
                return@launch
            }

            _uiState.value = when (result) {
                is SceneRecommendationResult.Finished -> CameraRecommendationUiState.Finished(result.response)

                is SceneRecommendationResult.RequestFailed -> CameraRecommendationUiState.RequestFailed(result.error)

                is SceneRecommendationResult.PollingTimedOut -> CameraRecommendationUiState.TimedOut(result.analysisId)
            }
        }
    }
}
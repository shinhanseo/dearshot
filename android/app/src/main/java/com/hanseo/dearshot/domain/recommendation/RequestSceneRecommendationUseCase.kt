package com.hanseo.dearshot.domain.recommendation

import android.system.Os.poll
import com.hanseo.dearshot.analysis.recommendation.RecommendationSnapshot
import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.remote.scene.SceneAnalysisRequestMapper
import com.hanseo.dearshot.data.remote.scene.SceneAnalysisStatusResponse
import com.hanseo.dearshot.data.repository.SceneAnalysisRepository
import com.hanseo.dearshot.data.repository.UploadRepository
import javax.inject.Inject
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

sealed interface SceneRecommendationResult {
    data class Finished(
        val response: SceneAnalysisStatusResponse
    ) : SceneRecommendationResult

    data class RequestFailed(
        val error: ApiFailure
    ) : SceneRecommendationResult

    data class PollingTimedOut(
        val analysisId: String
    ) : SceneRecommendationResult
}

class RequestSceneRecommendationUseCase @Inject constructor(
    private val uploadRepository: UploadRepository,
    private val sceneAnalysisRepository: SceneAnalysisRepository,
    private val requestMapper: SceneAnalysisRequestMapper
) {
    suspend fun request(
        snapshot: RecommendationSnapshot,
        sceneRevision: Int,
        locale: String
    ) : SceneRecommendationResult {
        val upload = when(
            val result = uploadRepository.uploadScreenSnapshot(snapshot)
        ) {
            is ApiResult.Success -> result.data
            is ApiResult.Failure -> {
                return SceneRecommendationResult.RequestFailed(result.error)
            }
        }

        val request = requestMapper.map(
            snapshot = snapshot,
            uploadId = upload.uploadId,
            sceneRevision = sceneRevision,
            locale = locale
        )

        val analysis = when(
            val result = sceneAnalysisRepository.create(
                request = request,
                idempotencyKey = snapshot.id
            )
        ) {
            is ApiResult.Success -> result.data
            is ApiResult.Failure -> {
                return SceneRecommendationResult.RequestFailed(result.error)
            }
        }

        return withTimeoutOrNull(30.seconds) {
            poll(
                analysisId = analysis.analysisId,
                firstPollAfterMs = analysis.pollAfterMs,
            )
        } ?: SceneRecommendationResult.PollingTimedOut(analysis.analysisId)
    }

    private suspend fun poll(
        analysisId: String,
        firstPollAfterMs: Long,
    ): SceneRecommendationResult {
        var nextPollAfterMs = firstPollAfterMs

        while (true) {
            delay(nextPollAfterMs.coerceAtLeast(MIN_POLL_INTERVAL_MS).milliseconds)

            when (val result = sceneAnalysisRepository.get(analysisId)) {
                is ApiResult.Failure -> {
                    return SceneRecommendationResult.RequestFailed(result.error)
                }

                is ApiResult.Success -> {
                    val response = result.data

                    when (response.status) {
                        "QUEUED", "PROCESSING" -> {
                            nextPollAfterMs =
                                response.pollAfterMs ?: DEFAULT_POLL_INTERVAL_MS
                        }

                        else -> {
                            return SceneRecommendationResult.Finished(response)
                        }
                    }
                }
            }
        }
    }

    private companion object {
        const val POLLING_TIMEOUT_MS = 30_000L
        const val DEFAULT_POLL_INTERVAL_MS = 1_000L
        const val MIN_POLL_INTERVAL_MS = 250L
    }
}
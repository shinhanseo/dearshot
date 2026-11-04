package com.hanseo.dearshot.data.repository

import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.remote.apiCall
import com.hanseo.dearshot.data.remote.scene.CreateSceneAnalysisResponse
import com.hanseo.dearshot.data.remote.scene.SceneAnalysisApi
import com.hanseo.dearshot.data.remote.scene.SceneAnalysisRequest
import com.hanseo.dearshot.data.remote.scene.SceneAnalysisStatusResponse
import javax.inject.Inject

class SceneAnalysisRepository @Inject constructor(
    private val api: SceneAnalysisApi
) {
    suspend fun create(
        request: SceneAnalysisRequest,
        idempotencyKey: String,
    ) : ApiResult<CreateSceneAnalysisResponse> = apiCall {
        api.create(
            idempotencyKey = idempotencyKey,
            request = request,
        )
    }

    suspend fun get(
        analysisId: String,
    ) : ApiResult<SceneAnalysisStatusResponse> = apiCall {
        api.get(analysisId = analysisId)
    }
}
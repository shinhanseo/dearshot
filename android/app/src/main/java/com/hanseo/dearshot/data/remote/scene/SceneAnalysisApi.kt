package com.hanseo.dearshot.data.remote.scene

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.Path

interface SceneAnalysisApi {
    @POST("scene-analyses")
    suspend fun create(
        @Header("Idempotency-Key") idempotencyKey: String,
        @Body request: SceneAnalysisRequest,
    ): Response<CreateSceneAnalysisResponse>

    @GET("scene-analyses/{analysisId}")
    suspend fun get(
        @Path("analysisId") analysisId: String,
    ): Response<SceneAnalysisStatusResponse>
}
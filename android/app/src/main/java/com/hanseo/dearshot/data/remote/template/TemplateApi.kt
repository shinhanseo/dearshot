package com.hanseo.dearshot.data.remote.template

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface TemplateApi {

    @GET("templates/{templateId}")
    suspend fun getDetail(
        @Path("templateId") templateId: String,
        @Query("locale") locale: String,
        @Query("version") version: Int,
    ): Response<TemplateDetailResponse>
}
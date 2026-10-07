package com.hanseo.dearshot.data.remote.config

import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface AppConfigApi {
    @GET("app-config")
    suspend fun getAppConfig(
        @Query("appVersion") appVersion: String,
        @Query("locale") locale: String,
        @Query("platform") platform: String = "android",
    ): Response<AppConfigResponse>
}
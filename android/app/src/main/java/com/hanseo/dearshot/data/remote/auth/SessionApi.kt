package com.hanseo.dearshot.data.remote.auth

import kotlinx.serialization.Serializable
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Header

interface SessionApi {
    @GET("me")
    suspend fun getMe(
        @Header("Authorization") authorization: String,
    ) : Response<SessionProfileResponse>
}

@Serializable
data class SessionProfileResponse(
    val id: String,
)
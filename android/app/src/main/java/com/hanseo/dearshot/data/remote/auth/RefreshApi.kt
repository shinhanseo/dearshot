package com.hanseo.dearshot.data.remote.auth

import kotlinx.serialization.Serializable
import retrofit2.Call
import retrofit2.http.Body
import retrofit2.http.POST

@Serializable
data class RefreshTokenRequest(
    val refreshToken: String,
)

@Serializable
data class RefreshTokenResponse(
    val accessToken: String,
    val refreshToken: String,
)

interface RefreshApi {
    @POST("auth/refresh")
    fun refresh(
        @Body request: RefreshTokenRequest
    ): Call<RefreshTokenResponse>
}

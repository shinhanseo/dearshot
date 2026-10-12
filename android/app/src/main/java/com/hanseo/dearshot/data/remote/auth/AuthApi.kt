package com.hanseo.dearshot.data.remote.auth

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

interface AuthApi {
    @POST("auth/guest")
    suspend fun loginGuest(
        @Body request: GuestAuthRequest
    ): Response<GuestAuthResponse>
}


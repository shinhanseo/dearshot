package com.hanseo.dearshot.data.remote.upload

import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

interface UploadsApi {
    @Multipart
    @POST("uploads")
    suspend fun upload(
        @Header("Idempotency-Key")
        idempotencyKey: String,

        @Part("purpose")
        purpose: RequestBody,

        @Part
        image: MultipartBody.Part,
    ): Response<UploadResponse>
}
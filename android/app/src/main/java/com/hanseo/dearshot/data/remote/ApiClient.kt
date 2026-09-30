package com.hanseo.dearshot.data.remote

import com.hanseo.dearshot.BuildConfig
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

object ApiClient {
    private val json = Json { ignoreUnknownKeys = true }

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private val retrofit: Retrofit by lazy {
        val baseUrl = BuildConfig.API_BASE_URL
        require(baseUrl.isNotBlank()) { "API_BASE_URL is not configured" }

        Retrofit.Builder()
            .baseUrl(baseUrl.trimEnd('/') + "/")
            .client(httpClient)
            .addConverterFactory(
                json.asConverterFactory("application/json".toMediaType())
            )
            .build()
    }

    fun <T> create(service: Class<T>): T = retrofit.create(service)
}
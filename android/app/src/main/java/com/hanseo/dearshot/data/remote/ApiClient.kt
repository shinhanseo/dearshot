package com.hanseo.dearshot.data.remote

import com.hanseo.dearshot.BuildConfig
import com.hanseo.dearshot.data.local.TokenStore
import com.hanseo.dearshot.data.remote.auth.AuthAuthenticator
import com.hanseo.dearshot.data.remote.auth.AuthInterceptor
import com.hanseo.dearshot.data.remote.auth.RefreshApi
import com.hanseo.dearshot.data.remote.auth.RefreshRequestInterceptor
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

class ApiClient(
    private val tokenStore: TokenStore,
) {
    private val json = Json {
        ignoreUnknownKeys = true
    }

    private val baseUrl = BuildConfig.API_BASE_URL
        .trim()
        .let { url ->
            require(url.isNotBlank()) {
                "API_BASE_URL is not configured"
            }

            url.trimEnd('/') + "/"
        }

    // 토큰 갱신 전용: 자동 인증 처리를 연결하지 않는다.
    private val refreshHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(20, TimeUnit.SECONDS)
            .addInterceptor(RefreshRequestInterceptor())
            .authenticator(Authenticator.NONE)
            .retryOnConnectionFailure(false)
            .followRedirects(false)
            .followSslRedirects(false)
            .build()
    }

    private val refreshApi: RefreshApi by lazy {
        createRetrofit(refreshHttpClient)
            .create(RefreshApi::class.java)
    }

    // 일반 API: 토큰 첨부와 만료 시 갱신을 연결한다.
    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(
                AuthInterceptor(
                    tokenStore = tokenStore,
                    baseUrl = baseUrl,
                )
            )
            .authenticator(
                AuthAuthenticator(
                    tokenStore = tokenStore,
                    refreshApi = refreshApi,
                )
            )
            .build()
    }

    private val retrofit: Retrofit by lazy {
        createRetrofit(httpClient)
    }

    private fun createRetrofit(client: OkHttpClient): Retrofit {
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(
                json.asConverterFactory(
                    "application/json".toMediaType()
                )
            )
            .build()
    }

    fun <T> create(service: Class<T>): T {
        return retrofit.create(service)
    }
}

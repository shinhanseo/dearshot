package com.hanseo.dearshot.data.remote.auth

import com.hanseo.dearshot.data.local.TokenStore
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(
    private val tokenStore: TokenStore,
    baseUrl: String,
) : Interceptor {
    private val apiUrl = (baseUrl.trimEnd('/') + "/").toHttpUrl()

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()

        // DearShot API 요청인지 확인한다.
        val isDearShotApi =
            request.url.scheme == apiUrl.scheme &&
                    request.url.host == apiUrl.host &&
                    request.url.port == apiUrl.port &&
                    request.url.encodedPath.startsWith(apiUrl.encodedPath)

        if (!isDearShotApi) {
            return chain.proceed(request)
        }

        // 로그인·게스트 발급·갱신 등 auth API에는 자동 첨부하지 않는다.
        val authPath = "${apiUrl.encodedPath}auth/"

        if (request.url.encodedPath.startsWith(authPath)) {
            return chain.proceed(request)
        }

        // 호출한 쪽에서 직접 지정한 Authorization은 유지한다.
        if (request.header("Authorization") != null) {
            return chain.proceed(request)
        }

        val tokens = runBlocking {
            tokenStore.getTokens()
        }

        // 저장된 토큰이 없으면 원래 요청을 그대로 보낸다.
        if (tokens == null) {
            return chain.proceed(request)
        }

        val authenticatedRequest = request.newBuilder()
            .header(
                "Authorization",
                "Bearer ${tokens.accessToken}",
            )
            .build()

        return chain.proceed(authenticatedRequest)
    }
}
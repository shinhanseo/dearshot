package com.hanseo.dearshot.data.remote.auth

import com.hanseo.dearshot.data.local.AuthTokens
import com.hanseo.dearshot.data.local.TokenStore
import com.hanseo.dearshot.data.remote.parseApiFailure
import java.io.IOException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.SerializationException
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

class AuthAuthenticator(
    private val tokenStore: TokenStore,
    private val refreshApi: RefreshApi,
) : Authenticator {

    private val refreshLock = Any()

    private var lastAttemptedRefreshToken: String? = null
    private var lastSuccessfulRefresh: RefreshTransition? = null

    private data class RefreshTransition(
        val previousAccessToken: String,
        val newTokens: AuthTokens,
    )

    override fun authenticate(
        route: Route?,
        response: Response,
    ): Request? {
        if (response.code != 401) return null

        // 이미 인증 재시도 후 받은 401이면 더 시도하지 않는다.
        if (hasPreviousUnauthorized(response)) return null

        // 다시 전송할 수 없는 요청 본문은 자동 재시도하지 않는다.
        val requestBody = response.request.body
        if (requestBody?.isOneShot() == true ||
            requestBody?.isDuplex() == true
        ) {
            return null
        }

        val authorization =
            response.request.header("Authorization") ?: return null

        if (!authorization.startsWith("Bearer ")) return null

        val failedAccessToken = authorization.removePrefix("Bearer ")
        if (failedAccessToken.isBlank()) return null

        // 원래 오류 본문을 소비하지 않고 오류 코드를 확인한다.
        val failure = parseApiFailure(
            status = response.code,
            errorBody = response.peekBody(8_192L).string(),
            requestIdHeader = response.header("X-Request-ID"),
            retryAfterHeader = response.header("Retry-After"),
        )

        if (failure.code != "TOKEN_EXPIRED") return null

        return synchronized(refreshLock) {
            runBlocking {
                val currentTokens =
                    tokenStore.getTokens() ?: return@runBlocking null

                // 다른 요청이 이미 갱신했다면 그 결과를 재사용한다.
                if (currentTokens.accessToken != failedAccessToken) {
                    val transition = lastSuccessfulRefresh

                    val refreshedByThisAuthenticator =
                        transition?.previousAccessToken == failedAccessToken &&
                                transition.newTokens == currentTokens

                    if (!refreshedByThisAuthenticator) {
                        return@runBlocking null
                    }

                    return@runBlocking retryRequest(
                        response,
                        currentTokens.accessToken,
                    )
                }

                // 같은 refreshToken으로 갱신을 반복하지 않는다.
                if (lastAttemptedRefreshToken == currentTokens.refreshToken) {
                    return@runBlocking null
                }

                lastAttemptedRefreshToken = currentTokens.refreshToken

                val refreshResponse = try {
                    refreshApi.refresh(
                        RefreshTokenRequest(
                            refreshToken = currentTokens.refreshToken,
                        )
                    ).execute()
                } catch (e: IOException) {
                    return@runBlocking null
                } catch (e: SerializationException) {
                    return@runBlocking null
                }

                if (!refreshResponse.isSuccessful) {
                    refreshResponse.errorBody()?.close()

                    // 서버가 refreshToken을 거절한 경우에만 삭제한다.
                    if (refreshResponse.code() == 401) {
                        tokenStore.replaceIfCurrent(
                            expected = currentTokens,
                            replacement = null,
                        )
                    }

                    return@runBlocking null
                }

                val body =
                    refreshResponse.body() ?: return@runBlocking null

                if (body.accessToken.isBlank() ||
                    body.refreshToken.isBlank()
                ) {
                    return@runBlocking null
                }

                val newTokens = AuthTokens(
                    accessToken = body.accessToken,
                    refreshToken = body.refreshToken,
                )

                // 갱신 중 로그아웃·계정 변경이 있었다면 적용하지 않는다.
                val saved = tokenStore.replaceIfCurrent(
                    expected = currentTokens,
                    replacement = newTokens,
                )

                if (!saved) return@runBlocking null

                lastSuccessfulRefresh = RefreshTransition(
                    previousAccessToken = currentTokens.accessToken,
                    newTokens = newTokens,
                )

                retryRequest(response, newTokens.accessToken)
            }
        }
    }

    private fun retryRequest(
        response: Response,
        accessToken: String,
    ): Request {
        return response.request.newBuilder()
            .header("Authorization", "Bearer $accessToken")
            .build()
    }

    private fun hasPreviousUnauthorized(response: Response): Boolean {
        var previous = response.priorResponse

        while (previous != null) {
            if (previous.code == 401) return true
            previous = previous.priorResponse
        }

        return false
    }
}
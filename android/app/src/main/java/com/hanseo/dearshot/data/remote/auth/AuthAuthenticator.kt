package com.hanseo.dearshot.data.remote.auth

import android.os.SystemClock
import com.hanseo.dearshot.data.local.AuthTokens
import com.hanseo.dearshot.data.local.TokenStore
import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.data.remote.parseApiFailure
import java.io.IOException
import java.net.ConnectException
import java.net.UnknownHostException
import java.util.concurrent.TimeUnit
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
    private var lastRefreshFailure: ApiFailure? = null
    private var nextRefreshAllowedAt: Long? = null

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

                // 같은 토큰의 재시도는 실패 종류와 대기 시간에 따라 허용한다.
                if (lastAttemptedRefreshToken == currentTokens.refreshToken) {
                    val retryAt = nextRefreshAllowedAt
                    val canRetry = retryAt != null &&
                            SystemClock.elapsedRealtime() >= retryAt

                    if (!canRetry) {
                        throw RefreshFailedException(
                            lastRefreshFailure
                                ?: ApiFailure.SessionRecoveryRequired
                        )
                    }
                }

                lastAttemptedRefreshToken = currentTokens.refreshToken
                nextRefreshAllowedAt = null
                // 결과를 확인하기 전에는 토큰이 이미 회전했을 가능성을 남긴다.
                lastRefreshFailure = ApiFailure.SessionRecoveryRequired

                val refreshResponse = try {
                    refreshApi.refresh(
                        RefreshTokenRequest(
                            refreshToken = currentTokens.refreshToken,
                        )
                    ).execute()
                } catch (e: IOException) {
                    val failedBeforeConnection =
                        e is UnknownHostException || e is ConnectException

                    if (failedBeforeConnection) {
                        lastRefreshFailure = ApiFailure.Network
                        nextRefreshAllowedAt =
                            SystemClock.elapsedRealtime() + 3_000L
                    }

                    throw RefreshFailedException(
                        lastRefreshFailure
                            ?: ApiFailure.SessionRecoveryRequired
                    )
                } catch (e: SerializationException) {
                    throw RefreshFailedException(
                        ApiFailure.SessionRecoveryRequired
                    )
                }

                if (!refreshResponse.isSuccessful) {
                    val errorBody = try {
                        refreshResponse.errorBody()?.use { body ->
                            body.string()
                        }
                    } catch (e: IOException) {
                        null
                    }

                    val refreshFailure = parseApiFailure(
                        status = refreshResponse.code(),
                        errorBody = errorBody,
                        requestIdHeader =
                            refreshResponse.headers()["X-Request-ID"],
                        retryAfterHeader =
                            refreshResponse.headers()["Retry-After"],
                    )

                    val tokenWasRejected =
                        refreshFailure.status == 401 &&
                                (refreshFailure.code == "TOKEN_EXPIRED" ||
                                    refreshFailure.code == "INVALID_TOKEN")

                    if (tokenWasRejected) {
                        tokenStore.replaceIfCurrent(
                            expected = currentTokens,
                            replacement = null,
                        )
                        return@runBlocking null
                    }

                    // 현재 백엔드의 RATE_LIMITED는 갱신 처리 전에 발생한다.
                    if (refreshFailure.status == 429 &&
                        refreshFailure.code == "RATE_LIMITED"
                    ) {
                        val retryAfterSeconds =
                            (refreshFailure.retryAfterSeconds ?: 5L)
                                .coerceAtLeast(1L)
                        val delayMillis =
                            TimeUnit.SECONDS.toMillis(retryAfterSeconds)
                        val now = SystemClock.elapsedRealtime()

                        nextRefreshAllowedAt =
                            if (delayMillis > Long.MAX_VALUE - now) {
                                Long.MAX_VALUE
                            } else {
                                now + delayMillis
                            }
                        lastRefreshFailure = refreshFailure

                        throw RefreshFailedException(refreshFailure)
                    }

                    throw RefreshFailedException(
                        ApiFailure.SessionRecoveryRequired
                    )
                }

                val body = refreshResponse.body()
                    ?: throw RefreshFailedException(
                        ApiFailure.SessionRecoveryRequired
                    )

                if (body.accessToken.isBlank() ||
                    body.refreshToken.isBlank()
                ) {
                    throw RefreshFailedException(
                        ApiFailure.SessionRecoveryRequired
                    )
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
                lastRefreshFailure = null
                nextRefreshAllowedAt = null

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

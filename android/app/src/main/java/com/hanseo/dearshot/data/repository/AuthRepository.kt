package com.hanseo.dearshot.data.repository

import com.hanseo.dearshot.data.device.AppInfoProvider
import com.hanseo.dearshot.data.local.AuthTokens
import com.hanseo.dearshot.data.local.InstallationStore
import com.hanseo.dearshot.data.local.TokenStore
import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.remote.apiCall
import com.hanseo.dearshot.data.remote.auth.AuthApi
import com.hanseo.dearshot.data.remote.auth.GuestAuthRequest
import com.hanseo.dearshot.data.remote.auth.GuestAuthResponse
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import com.hanseo.dearshot.data.remote.auth.AuthDevice
import com.hanseo.dearshot.data.remote.auth.KakaoAuthRequest
import com.hanseo.dearshot.data.remote.auth.MemberAuthResponse
import com.hanseo.dearshot.data.remote.auth.SessionApi
import com.hanseo.dearshot.data.remote.auth.GoogleAuthRequest
import retrofit2.Response
import java.io.IOException
@Singleton
class AuthRepository @Inject constructor(
    private val api: AuthApi,
    private val installationStore: InstallationStore,
    private val appInfoProvider: AppInfoProvider,
    private val tokenStore: TokenStore,
    private val sessionApi: SessionApi
) {
    private val mutex = Mutex()

    suspend fun loginGuest(): ApiResult<GuestAuthResponse> =
        mutex.withLock {
            try {
                val request = GuestAuthRequest(
                    installationId = installationStore.getOrCreatedId(),
                    locale = appInfoProvider.getLocale(),
                    appVersion = appInfoProvider.getAppVersion(),
                )

                val result = apiCall {
                    api.loginGuest(request)
                }

                when (result) {
                    is ApiResult.Success -> {
                        val response = result.data

                        tokenStore.save(
                            AuthTokens(
                                accessToken = response.accessToken,
                                refreshToken = response.refreshToken,
                            )
                        )

                        result
                    }

                    is ApiResult.Failure -> {
                        result
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                ApiResult.Failure(ApiFailure.Unexpected)
            }
        }

    suspend fun loginKakao(
        kakaoAccessToken: String,
        linkGuestSession: Boolean,
    ): ApiResult<MemberAuthResponse> = loginMember(linkGuestSession) { context, device ->
        require(kakaoAccessToken.isNotBlank())
        api.loginKakao(KakaoAuthRequest(kakaoAccessToken, device, context.guestAccessToken))
    }

    suspend fun loginGoogle(
        idToken: String,
        nonce: String,
        linkGuestSession: Boolean,
    ): ApiResult<MemberAuthResponse> = loginMember(linkGuestSession) { context, device ->
        require(idToken.isNotBlank() && nonce.length in 16..256)
        api.loginGoogle(GoogleAuthRequest(idToken, nonce, device, context.guestAccessToken))
    }

    // Both providers share guest linking and compare-and-set token persistence.
    private suspend fun loginMember(
        linkGuestSession: Boolean,
        request: suspend (LoginContext, AuthDevice) -> Response<MemberAuthResponse>,
    ): ApiResult<MemberAuthResponse> = mutex.withLock {
        try {
            val loginContext = when (val result = resolveLoginContext(linkGuestSession)) {
                is ApiResult.Success -> result.data
                is ApiResult.Failure -> return@withLock result
            }
            val device = AuthDevice(
                installationId = installationStore.getOrCreatedId(),
                platform = "ANDROID",
                appVersion = appInfoProvider.getAppVersion(),
            )

            when (
                val result = apiCall {
                    request(loginContext, device)
                }
            ) {
                is ApiResult.Success -> {
                    val response = result.data

                    val saved = tokenStore.replaceIfCurrent(
                        expected = loginContext.tokens,
                        replacement = AuthTokens(
                            accessToken = response.accessToken,
                            refreshToken = response.refreshToken,
                        ),
                    )

                    if (saved) {
                        result
                    } else {
                        ApiResult.Failure(
                            ApiFailure.SessionRecoveryRequired
                        )
                    }
                }

                is ApiResult.Failure -> result
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: IOException) {
            ApiResult.Failure(ApiFailure.Network)
        } catch (e: Exception) {
            ApiResult.Failure(ApiFailure.Unexpected)
        }
    }

    private suspend fun resolveLoginContext(
        linkGuestSession: Boolean,
    ): ApiResult<LoginContext> {
        val originalTokens = tokenStore.getTokens()

        // 새 로그인에서는 기존 세션의 게스트 이어받기를 요청하지 않는다.
        if (!linkGuestSession || originalTokens == null) {
            return ApiResult.Success(
                LoginContext(
                    tokens = originalTokens,
                    guestAccessToken = null,
                )
            )
        }

        var usedAuthorization: String? = null

        val result = apiCall {
            sessionApi.getMe(
                authorization =
                    "Bearer ${originalTokens.accessToken}",
            ).also { response ->
                // 자동 갱신이 있었다면 갱신된 요청의 헤더가 들어간다.
                usedAuthorization = response.raw()
                    .request
                    .header("Authorization")
            }
        }

        val isGuest = when (result) {
            is ApiResult.Success -> {
                // /me 조회 성공은 회원 세션이다.
                false
            }

            is ApiResult.Failure -> {
                val error = result.error

                val validGuestSession =
                    error is ApiFailure.Http &&
                            error.status == 403 &&
                            error.code == "AUTH_REQUIRED"

                if (!validGuestSession) {
                    return result
                }

                true
            }
        }

        val currentTokens = tokenStore.getTokens()

        // 확인한 세션과 현재 저장된 세션이 일치해야 이어받는다.
        if (
            currentTokens == null ||
            usedAuthorization != "Bearer ${currentTokens.accessToken}"
        ) {
            return ApiResult.Failure(
                ApiFailure.SessionRecoveryRequired
            )
        }

        return ApiResult.Success(
            LoginContext(
                tokens = currentTokens,
                guestAccessToken = if (isGuest) {
                    currentTokens.accessToken
                } else {
                    null
                },
            )
        )
    }

    private class LoginContext(
        val tokens: AuthTokens?,
        val guestAccessToken: String?,
    )
}

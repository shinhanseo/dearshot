package com.hanseo.dearshot.data.device.auth

import android.app.Activity
import androidx.annotation.MainThread
import com.kakao.sdk.auth.model.OAuthToken
import com.kakao.sdk.common.model.ClientError
import com.kakao.sdk.common.model.ClientErrorCause
import com.kakao.sdk.user.UserApiClient
import javax.inject.Inject

sealed interface KakaoLoginResult {

    data class Success(
        val accessToken: String,
    ) : KakaoLoginResult {
        override fun toString(): String =
            "Success(accessToken=[REDACTED])"
    }

    data object Cancelled : KakaoLoginResult

    data class Failure(
        val cause: Throwable,
    ) : KakaoLoginResult
}

class KakaoLoginClient @Inject constructor() {

    @MainThread
    fun login(
        activity: Activity,
        onResult: (KakaoLoginResult) -> Unit,
    ) {
        try {
            val client = UserApiClient.instance

            if (client.isKakaoTalkLoginAvailable(activity)) {
                client.loginWithKakaoTalk(activity) { token, error ->
                    when {
                        isCancelled(error) -> {
                            onResult(KakaoLoginResult.Cancelled)
                        }

                        error != null -> {
                            loginWithAccount(
                                activity = activity,
                                onResult = onResult,
                            )
                        }

                        else -> {
                            onResult(
                                toResult(
                                    token = token,
                                    error = null,
                                )
                            )
                        }
                    }
                }
            } else {
                loginWithAccount(
                    activity = activity,
                    onResult = onResult,
                )
            }
        } catch (e: Exception) {
            onResult(
                toResult(
                    token = null,
                    error = e,
                )
            )
        }
    }

    private fun loginWithAccount(
        activity: Activity,
        onResult: (KakaoLoginResult) -> Unit,
    ) {
        try {
            UserApiClient.instance.loginWithKakaoAccount(
                context = activity,
            ) { token, error ->
                onResult(
                    toResult(
                        token = token,
                        error = error,
                    )
                )
            }
        } catch (e: Exception) {
            onResult(
                toResult(
                    token = null,
                    error = e,
                )
            )
        }
    }

    private fun toResult(
        token: OAuthToken?,
        error: Throwable?,
    ): KakaoLoginResult {
        return when {
            isCancelled(error) -> {
                KakaoLoginResult.Cancelled
            }

            error != null -> {
                KakaoLoginResult.Failure(error)
            }

            token == null || token.accessToken.isBlank() -> {
                KakaoLoginResult.Failure(
                    IllegalStateException(
                        "Kakao login returned no access token"
                    )
                )
            }

            else -> {
                KakaoLoginResult.Success(
                    accessToken = token.accessToken,
                )
            }
        }
    }

    private fun isCancelled(
        error: Throwable?,
    ): Boolean {
        return error is ClientError &&
                error.reason == ClientErrorCause.Cancelled
    }
}
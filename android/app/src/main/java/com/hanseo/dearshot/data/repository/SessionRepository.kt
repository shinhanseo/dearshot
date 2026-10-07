package com.hanseo.dearshot.data.repository

import com.hanseo.dearshot.data.local.TokenStore
import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.remote.apiCall
import com.hanseo.dearshot.data.remote.auth.SessionApi
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

sealed interface SessionRestoreResult {

    data object Restored : SessionRestoreResult

    data object LoginRequired : SessionRestoreResult

    data class Failure(
        val error: ApiFailure,
    ) : SessionRestoreResult
}

class SessionRepository(
    private val api: SessionApi,
    private val tokenStore: TokenStore,
) {
    private val mutex = Mutex()

    suspend fun restoreSession(): SessionRestoreResult =
        mutex.withLock {
            try {
                restoreStoredSession()
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                SessionRestoreResult.Failure(ApiFailure.Network)
            } catch (e: Exception) {
                SessionRestoreResult.Failure(ApiFailure.Unexpected)
            }
        }

    private suspend fun restoreStoredSession(): SessionRestoreResult {
        val originalTokens = tokenStore.getTokens() ?: return SessionRestoreResult.LoginRequired

        val result = apiCall {
            api.getMe(
                authorization = "Bearer ${originalTokens.accessToken}",
            )
        }

        // 자동 갱신 과정에서 세션이 삭제되었거나,
        // 요청 중 로그아웃했다면 로그인 화면으로 이동한다.
        if (tokenStore.getTokens() == null) {
            return SessionRestoreResult.LoginRequired
        }

        return when (result) {
            is ApiResult.Success -> {
                SessionRestoreResult.Restored
            }

            is ApiResult.Failure -> {
                val error = result.error

                when {
                    // 현재 /me는 유효한 비회원에게 이 오류를 반환한다.
                    error is ApiFailure.Http &&
                            error.status == 403 &&
                            error.code == "AUTH_REQUIRED" -> {
                        SessionRestoreResult.Restored
                    }

                    // 서버가 세션을 명확히 거절한 경우.
                    error is ApiFailure.Http &&
                            error.status == 401 &&
                            error.code == "INVALID_TOKEN" -> {
                        val cleared = tokenStore.replaceIfCurrent(
                            expected = originalTokens,
                            replacement = null,
                        )

                        if (cleared) {
                            SessionRestoreResult.LoginRequired
                        } else {
                            // 요청 중 토큰이 바뀌었다면
                            // 새 토큰을 삭제하거나 로그아웃시키지 않는다.
                            SessionRestoreResult.Failure(error)
                        }
                    }

                    else -> {
                        SessionRestoreResult.Failure(error)
                    }
                }
            }
        }
    }
}
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

@Singleton
class AuthRepository @Inject constructor(
    private val api: AuthApi,
    private val installationStore: InstallationStore,
    private val appInfoProvider: AppInfoProvider,
    private val tokenStore: TokenStore
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
}

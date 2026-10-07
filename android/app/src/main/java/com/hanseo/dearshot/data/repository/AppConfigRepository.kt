package com.hanseo.dearshot.data.repository

import android.os.SystemClock
import com.hanseo.dearshot.data.device.AppInfoProvider
import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.remote.apiCall
import com.hanseo.dearshot.data.remote.config.AppConfigApi
import com.hanseo.dearshot.data.remote.config.AppConfigResponse
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class AppConfigRepository(
    private val api: AppConfigApi,
    private val appInfoProvider: AppInfoProvider,
) {
    private val mutex = Mutex()
    private var cachedConfig: CachedConfig? = null

    suspend fun getAppConfig(
        forceRefresh: Boolean = false,
    ): ApiResult<AppConfigResponse> = mutex.withLock {
        val appVersion = appInfoProvider.getAppVersion()
        val locale = appInfoProvider.getLocale()
        val cached = cachedConfig

        val canUseCache = !forceRefresh &&
                cached != null &&
                cached.appVersion == appVersion &&
                cached.locale == locale &&
                SystemClock.elapsedRealtime() - cached.savedAt < CACHE_TTL_MS

        if (canUseCache) {
            return@withLock ApiResult.Success(cached.config)
        }

        val result = apiCall {
            api.getAppConfig(
                appVersion = appVersion,
                locale = locale,
            )
        }

        if (result is ApiResult.Success) {
            cachedConfig = CachedConfig(
                config = result.data,
                appVersion = appVersion,
                locale = locale,
                savedAt = SystemClock.elapsedRealtime(),
            )
        }

        result
    }

    private data class CachedConfig(
        val config: AppConfigResponse,
        val appVersion: String,
        val locale: String,
        val savedAt: Long,
    )

    private companion object {
        const val CACHE_TTL_MS = 60_000L
    }
}
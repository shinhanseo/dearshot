package com.hanseo.dearshot.di

import android.content.Context
import com.hanseo.dearshot.data.local.TokenStore
import com.hanseo.dearshot.data.remote.ApiClient
import com.hanseo.dearshot.data.local.InstallationStore
import com.hanseo.dearshot.data.device.AppInfoProvider
import com.hanseo.dearshot.data.remote.config.AppConfigApi

class AppContainer(context: Context) {

    val appInfoProvider = AppInfoProvider(context.applicationContext)

    val installationStore = InstallationStore(context.applicationContext)
    val tokenStore = TokenStore(context.applicationContext)

    val apiClient: ApiClient by lazy {
        ApiClient(tokenStore)
    }

    val appConfig: AppConfigApi by lazy {
        apiClient.create(AppConfigApi::class.java)
    }
}
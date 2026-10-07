package com.hanseo.dearshot.di

import android.content.Context
import com.hanseo.dearshot.data.local.TokenStore
import com.hanseo.dearshot.data.remote.ApiClient
import com.hanseo.dearshot.data.local.InstallationStore

class AppContainer(context: Context) {

    val installationStore = InstallationStore(context.applicationContext)
    val tokenStore = TokenStore(context.applicationContext)

    val apiClient: ApiClient by lazy {
        ApiClient(tokenStore)
    }
}
package com.hanseo.dearshot.di

import android.content.Context
import com.hanseo.dearshot.data.local.TokenStore
import com.hanseo.dearshot.data.remote.ApiClient

class AppContainer(context: Context) {

    val tokenStore = TokenStore(context.applicationContext)

    val apiClient: ApiClient by lazy {
        ApiClient(tokenStore)
    }
}
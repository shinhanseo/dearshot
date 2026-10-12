package com.hanseo.dearshot.di

import com.hanseo.dearshot.data.remote.ApiClient
import com.hanseo.dearshot.data.remote.auth.SessionApi
import com.hanseo.dearshot.data.remote.config.AppConfigApi
import com.hanseo.dearshot.data.remote.auth.AuthApi
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideAuthApi(
        apiClient: ApiClient,
    ): AuthApi {
        return apiClient.create(AuthApi::class.java)
    }

    @Provides
    @Singleton
    fun provideAppConfigApi(
        apiClient: ApiClient,
    ): AppConfigApi {
        return apiClient.create(AppConfigApi::class.java)
    }

    @Provides
    @Singleton
    fun provideSessionApi(
        apiClient: ApiClient,
    ): SessionApi {
        return apiClient.create(SessionApi::class.java)
    }
}
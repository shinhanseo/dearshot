package com.hanseo.dearshot

import android.app.Application
import com.kakao.sdk.common.KakaoSdk
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class DearShotApplication : Application() {

    override fun onCreate() {
        super.onCreate()

        val nativeAppKey = BuildConfig.KAKAO_NATIVE_APP_KEY

        require(nativeAppKey.isNotBlank()) {
            "KAKAO_NATIVE_APP_KEY is not configured"
        }

        KakaoSdk.init(
            context = this,
            appKey = nativeAppKey,
        )
    }
}
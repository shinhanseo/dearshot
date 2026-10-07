package com.hanseo.dearshot.data.device

import android.content.Context
import android.os.Build
import com.hanseo.dearshot.BuildConfig
import java.util.Locale

class AppInfoProvider(context: Context) {
    private val appContext = context.applicationContext

    fun getLocale(): String {
        val language = appContext.resources.configuration.locales[0]
            ?.language
            ?: Locale.getDefault().language

        return if (language == "ko") {
            "ko-KR"
        } else {
            "en-US"
        }
    }

    fun getAppVersion(): String {
        return BuildConfig.VERSION_NAME
    }
}


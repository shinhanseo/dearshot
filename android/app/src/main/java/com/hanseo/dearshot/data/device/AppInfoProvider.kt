package com.hanseo.dearshot.data.device

import android.content.Context
import android.os.Build
import com.hanseo.dearshot.BuildConfig
import java.util.Locale

class AppInfoProvider(context: Context) {
    private val appContext = context.applicationContext

    fun getLocale(): String {
        val locale = appContext.resources.configuration.locales[0] ?: Locale.getDefault()

        return locale.toLanguageTag()
    }

    fun getAppVersion(): String {
        return BuildConfig.VERSION_NAME
    }
}


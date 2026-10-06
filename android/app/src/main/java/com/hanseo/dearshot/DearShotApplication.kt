package com.hanseo.dearshot

import android.app.Application
import com.hanseo.dearshot.di.AppContainer

class DearShotApplication : Application() {

    val container: AppContainer by lazy {
        AppContainer(this)
    }
}
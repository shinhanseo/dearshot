package com.hanseo.dearshot.ui.camera

import androidx.annotation.MainThread
import androidx.lifecycle.ViewModel
import com.hanseo.dearshot.camera.CameraSession
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import javax.inject.Provider

/** 생성만 Hilt에 위임한다. 카메라 시작·종료는 기존 화면 생명주기가 담당한다. */
@HiltViewModel
class CameraDependenciesViewModel @Inject constructor(
    private val cameraSessionProvider: Provider<CameraSession>,
) : ViewModel() {
    @MainThread
    fun createCameraSession(): CameraSession = cameraSessionProvider.get()
}

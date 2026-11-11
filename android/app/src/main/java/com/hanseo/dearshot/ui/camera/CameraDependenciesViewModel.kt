package com.hanseo.dearshot.ui.camera

import androidx.annotation.MainThread
import androidx.lifecycle.ViewModel
import com.hanseo.dearshot.camera.CameraSession
import com.hanseo.dearshot.data.local.photo.CapturedPhotoStore
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import javax.inject.Provider

/**
 * 의존성 생성은 Hilt에 맡기고,
 * 카메라 시작·종료는 화면 생명주기에서 관리한다.
 */
@HiltViewModel
class CameraDependenciesViewModel @Inject constructor(
    private val cameraSessionProvider: Provider<CameraSession>,
    val photoStore: CapturedPhotoStore,
) : ViewModel() {

    @MainThread
    fun createCameraSession(): CameraSession {
        return cameraSessionProvider.get()
    }
}
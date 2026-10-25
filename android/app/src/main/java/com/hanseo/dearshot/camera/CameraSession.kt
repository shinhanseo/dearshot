package com.hanseo.dearshot.camera

import android.content.Context
import androidx.annotation.MainThread
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner

class CameraSession(
    context: Context,
) {
    private val appContext = context.applicationContext

    private val mainExecutor =
        ContextCompat.getMainExecutor(appContext)

    private var cameraProvider: ProcessCameraProvider? = null
    private var preview: Preview? = null

    // 이전 연결 요청이 뒤늦게 실행되는 것을 막기 위한 번호.
    private var connectionVersion = 0L

    @MainThread
    fun start(
        lifecycleOwner: LifecycleOwner,
        surfaceProvider: Preview.SurfaceProvider,
        onError: (Exception) -> Unit,
    ) {
        stop()

        val requestedVersion = connectionVersion

        val providerFuture =
            ProcessCameraProvider.getInstance(appContext)

        providerFuture.addListener(
            {
                // 대기 중 화면을 떠났거나 새 연결을 시작했다면 무시.
                if (requestedVersion == connectionVersion) {
                    try {
                        val provider = providerFuture.get()

                        val previewUseCase = Preview.Builder()
                            .build()
                            .also {
                                it.setSurfaceProvider(surfaceProvider)
                            }

                        cameraProvider = provider
                        preview = previewUseCase

                        provider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            previewUseCase,
                        )
                    } catch (exception: Exception) {
                        stop()
                        onError(exception)
                    }
                }
            },
            mainExecutor,
        )
    }

    @MainThread
    fun stop() {
        connectionVersion += 1

        preview?.let { useCase ->
            cameraProvider?.unbind(useCase)
            useCase.setSurfaceProvider(null)
        }

        preview = null
        cameraProvider = null
    }
}
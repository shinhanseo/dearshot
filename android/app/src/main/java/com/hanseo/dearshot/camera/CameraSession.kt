package com.hanseo.dearshot.camera

import android.content.Context
import androidx.annotation.MainThread
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.hanseo.dearshot.analysis.FrameAnalyzer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import com.hanseo.dearshot.analysis.DebugFrameWriter
import com.hanseo.dearshot.analysis.FrameBitmapConverter
import androidx.camera.core.UseCaseGroup
import androidx.camera.core.ViewPort

class CameraSession(
    context: Context,
) {
    private val appContext = context.applicationContext

    private val mainExecutor =
        ContextCompat.getMainExecutor(appContext)

    private var cameraProvider: ProcessCameraProvider? = null
    private var preview: Preview? = null
    private var imageAnalysis: ImageAnalysis? = null

    private var analysisExecutor: ExecutorService? = null

    // 준비 중인 이전 연결 요청을 무효화하기 위한 번호.
    private var connectionVersion = 0L

    @MainThread
    fun start(
        lifecycleOwner: LifecycleOwner,
        surfaceProvider: Preview.SurfaceProvider,
        viewPort: ViewPort,
        lens: CameraLens,
        onBound: (Boolean) -> Unit,
        onError: (Exception) -> Unit,
    ) {
        stop()

        val requestedVersion = connectionVersion

        val providerFuture =
            ProcessCameraProvider.getInstance(appContext)

        providerFuture.addListener(
            {
                if (requestedVersion == connectionVersion) {
                    try {
                        val provider = providerFuture.get()
                        cameraProvider = provider

                        val cameraSelector = lens.toCameraSelector()

                        check(provider.hasCamera(cameraSelector)) {
                            "Request camera is not available: $lens"
                        }

                        val canSwitchCamera =
                            provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) &&
                                    provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)

                        // 분석 작업은 메인 스레드와 분리한다.
                        val executor =
                            Executors.newSingleThreadExecutor { task ->
                                Thread(
                                    task,
                                    "DearShot-FrameAnalyzer",
                                )
                            }

                        analysisExecutor = executor

                        val previewUseCase = Preview.Builder()
                            .setTargetRotation(viewPort.rotation)
                            .build()

                        preview = previewUseCase

                        previewUseCase.setSurfaceProvider(
                            surfaceProvider
                        )

                        val analysisUseCase = ImageAnalysis.Builder()
                            .setTargetRotation(viewPort.rotation)
                            .setBackpressureStrategy(
                                ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST
                            )
                            .build()

                        imageAnalysis = analysisUseCase

                        analysisUseCase.setAnalyzer(
                            executor,
                            FrameAnalyzer(
                                bitmapConverter = FrameBitmapConverter(),
                                debugFrameWriter = DebugFrameWriter(appContext),
                            ),
                        )

                        // 같은 카메라에 미리보기와 분석을 함께 연결.
                        val useCaseGroup = UseCaseGroup.Builder()
                            .setViewPort(viewPort)
                            .addUseCase(previewUseCase)
                            .addUseCase(analysisUseCase)
                            .build()

                        provider.bindToLifecycle(
                            lifecycleOwner,
                            cameraSelector,
                            useCaseGroup,
                        )

                        onBound(canSwitchCamera)
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

        val currentProvider = cameraProvider
        val currentPreview = preview
        val currentAnalysis = imageAnalysis

        // 분석기로 새로운 프레임이 전달되는 것을 중단한다.
        currentAnalysis?.clearAnalyzer()

        // 이 세션에서 연결한 기능만 해제한다.
        currentAnalysis?.let {
            currentProvider?.unbind(it)
        }

        currentPreview?.let {
            currentProvider?.unbind(it)
            it.setSurfaceProvider(null)
        }

        // 진행 중인 작업은 마치고 실행기를 종료한다.
        analysisExecutor?.shutdown()

        imageAnalysis = null
        preview = null
        cameraProvider = null
        analysisExecutor = null
    }
}
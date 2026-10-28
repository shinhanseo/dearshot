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
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import java.io.File
import android.util.Log
import androidx.camera.core.Camera
import androidx.camera.core.ZoomState
import androidx.lifecycle.Observer

class CameraSession(
    context: Context,
) {
    private val appContext = context.applicationContext

    private val mainExecutor =
        ContextCompat.getMainExecutor(appContext)

    private var cameraProvider: ProcessCameraProvider? = null
    private var preview: Preview? = null
    private var imageAnalysis: ImageAnalysis? = null

    private var imageCapture: ImageCapture? = null

    // 촬영 요청이 완료될 때까지 추가 요청을 막는다.
    private var captureInProgress = false

    private var analysisExecutor: ExecutorService? = null

    private var boundCamera: Camera? = null
    private var zoomObserver: Observer<ZoomState>? = null

    // 준비 중인 이전 연결 요청을 무효화하기 위한 번호.
    private var connectionVersion = 0L

    @MainThread
    fun start(
        lifecycleOwner: LifecycleOwner,
        surfaceProvider: Preview.SurfaceProvider,
        viewPort: ViewPort,
        lens: CameraLens,
        onBound: (Boolean, Boolean) -> Unit,
        onZoomChanged: (CameraZoomInfo) -> Unit,
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

                        val captureUseCase = ImageCapture.Builder()
                            .setTargetRotation(viewPort.rotation)
                            .setCaptureMode(
                                ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY
                            )
                            .setFlashMode(ImageCapture.FLASH_MODE_OFF)
                            .build()

                        imageCapture = captureUseCase

                        // 같은 카메라에 미리보기와 분석과 촬영을 함께 연결.
                        val useCaseGroup = UseCaseGroup.Builder()
                            .setViewPort(viewPort)
                            .addUseCase(previewUseCase)
                            .addUseCase(analysisUseCase)
                            .addUseCase(captureUseCase)
                            .build()

                        val camera = provider.bindToLifecycle(
                            lifecycleOwner,
                            cameraSelector,
                            useCaseGroup,
                        )

                        boundCamera = camera

                        val observer = Observer<ZoomState> { zoom ->
                            onZoomChanged(
                                CameraZoomInfo(
                                    ratio = zoom.zoomRatio,
                                    minRatio = zoom.minZoomRatio,
                                    maxRatio = zoom.maxZoomRatio,
                                )
                            )
                        }

                        zoomObserver = observer

                        camera.cameraInfo.zoomState.observe(
                            lifecycleOwner,
                            observer,
                        )

                        onBound(
                            canSwitchCamera,
                            camera.cameraInfo.hasFlashUnit(),
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
    fun setFlashEnabled(enabled: Boolean) {
        imageCapture?.flashMode = if (enabled) {
            ImageCapture.FLASH_MODE_ON
        } else {
            ImageCapture.FLASH_MODE_OFF
        }
    }

    @MainThread
    fun setZoomRatio(ratio: Float) {
        val camera = boundCamera ?: return
        val zoom = camera.cameraInfo.zoomState.value ?: return

        if (!ratio.isFinite()) return

        val targetRatio = ratio.coerceIn(
            zoom.minZoomRatio,
            zoom.maxZoomRatio,
        )

        val requestedVersion = connectionVersion

        val future = camera.cameraControl.setZoomRatio(
            targetRatio
        )

        future.addListener(
            {
                // 이전 카메라에서 실행한 요청이면 결과를 무시한다.
                if (requestedVersion == connectionVersion) {
                    try {
                        future.get()
                    } catch (exception: Exception) {
                        Log.w(
                            "CameraZoom",
                            "Failed to apply zoom",
                            exception,
                        )
                    }
                }
            },
            mainExecutor,
        )
    }

    @MainThread
    fun takePhoto(
        outputFile: File,
        onResult: (Result<File>) -> Unit
    ) {
        val capture = imageCapture

        if (capture == null) {
            onResult(
                Result.failure(
                    IllegalStateException("Camera is not ready for capture")
                )
            )

            return
        }

        if (captureInProgress) {
            onResult(
                Result.failure(
                    IllegalStateException(
                        "A photo capture is already in progress"
                    )
                )
            )
            return
        }

        if (outputFile.exists()) {
            onResult(
                Result.failure(
                    IllegalArgumentException(
                        "Output file already exists"
                    )
                )
            )
            return
        }

        captureInProgress = true

        val outputOptions = ImageCapture.OutputFileOptions.Builder(
            outputFile
        ).build()

        try {
            capture.takePicture(
                outputOptions,
                mainExecutor,
                object : ImageCapture.OnImageSavedCallback {

                    override fun onImageSaved(
                        outputFileResults: ImageCapture.OutputFileResults,
                    ) {
                        captureInProgress = false

                        onResult(
                            Result.success(outputFile)
                        )
                    }

                    override fun onError(
                        exception: ImageCaptureException,
                    ) {
                        captureInProgress = false

                        // 실패하면서 생긴 불완전한 파일을 정리한다.
                        outputFile.delete()

                        onResult(
                            Result.failure(exception)
                        )
                    }
                },
            )
        } catch (exception: Exception) {
            captureInProgress = false
            outputFile.delete()

            onResult(
                Result.failure(exception)
            )
        }
    }

    @MainThread
    fun stop() {
        connectionVersion += 1

        val currentProvider = cameraProvider
        val currentPreview = preview
        val currentAnalysis = imageAnalysis
        val currentCapture = imageCapture

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

        currentCapture?.let {
            currentProvider?.unbind(it)
        }

        zoomObserver?.let { observer ->
            boundCamera?.cameraInfo?.zoomState
                ?.removeObserver(observer)
        }

        zoomObserver = null
        boundCamera = null

        // 진행 중인 작업은 마치고 실행기를 종료한다.
        analysisExecutor?.shutdown()

        imageAnalysis = null
        preview = null
        cameraProvider = null
        analysisExecutor = null
        imageCapture = null
    }
}

package com.hanseo.dearshot.analysis

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.annotation.WorkerThread
import com.hanseo.dearshot.analysis.detection.ObjectDetection
import com.hanseo.dearshot.analysis.detection.YoloxDetector
import com.hanseo.dearshot.analysis.recommendation.RecommendationSnapshot
import com.hanseo.dearshot.analysis.scene.AppScene
import com.hanseo.dearshot.analysis.scene.AppSceneMapper
import com.hanseo.dearshot.analysis.scene.Places365Classifier
import com.hanseo.dearshot.analysis.scene.SceneClassification
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.util.UUID
import javax.inject.Inject
import javax.inject.Provider

/**
 * 카메라 연결마다 Hilt에서 새로 받는 분석 자원. Singleton으로 공유하지 않는다.
 * 모델 생성·분석·종료는 같은 단일 분석 실행기에서 수행한다.
 */
class CameraAnalysisSession @Inject constructor(
    private val sceneProvider: Provider<Places365Classifier>,
    private val objectProvider: Provider<YoloxDetector>,
) : Closeable {
    private var sceneModel: Places365Classifier? = null
    private var objectModel: YoloxDetector? = null
    private val sceneMapper = AppSceneMapper()
    private var closed = false

    @WorkerThread
    fun classify(bitmap: Bitmap, topK: Int = 5): SceneClassification =
        sceneClassifier().classify(bitmap, topK)

    @WorkerThread
    fun detect(bitmap: Bitmap): ObjectDetection = objectDetector().detect(bitmap)

    @WorkerThread
    fun createSnapshot(
        bitmap: Bitmap,
        capturedAt: String,
        expectedScene: AppScene,
    ): RecommendationSnapshot {
        check(!closed) { "Camera analysis session has been closed" }
        check(!bitmap.isRecycled)
        require(expectedScene != AppScene.UNKNOWN)

        val jpegBytes = ByteArrayOutputStream().use { output ->
            check(bitmap.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, output)) {
                "Failed to encode recommendation image"
            }
            output.toByteArray()
        }
        val decoded = checkNotNull(BitmapFactory.decodeByteArray(jpegBytes, 0, jpegBytes.size)) {
            "Failed to decode recommendation image"
        }
        try {
            // 업로드할 JPEG와 모델이 분석하는 사진의 기준을 일치시킨다.
            val classification = classify(decoded)
            val mapped = sceneMapper.map(classification)
            check(mapped.scene != AppScene.UNKNOWN && mapped.scene == expectedScene) {
                "Scene changed: expected=$expectedScene, actual=${mapped.scene}"
            }
            val detection = detect(decoded)
            return RecommendationSnapshot(
                id = UUID.randomUUID().toString(),
                capturedAt = capturedAt,
                jpegBytes = jpegBytes,
                imageWidth = decoded.width,
                imageHeight = decoded.height,
                scene = mapped.scene,
                sceneClassification = classification,
                objectDetection = detection,
            )
        } finally {
            decoded.recycle()
        }
    }

    private fun sceneClassifier(): Places365Classifier {
        check(!closed) { "Camera analysis session has been closed" }
        return sceneModel ?: sceneProvider.get().also {
            sceneModel = it
            it.logModelInfo()
        }
    }

    private fun objectDetector(): YoloxDetector {
        check(!closed) { "Camera analysis session has been closed" }
        return objectModel ?: objectProvider.get().also { objectModel = it }
    }

    @WorkerThread
    override fun close() {
        if (closed) return
        closed = true
        try {
            sceneModel?.close()
        } finally {
            sceneModel = null
            try {
                objectModel?.close()
            } finally {
                objectModel = null
            }
        }
    }

    private companion object {
        const val JPEG_QUALITY = 90
    }
}

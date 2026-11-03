package com.hanseo.dearshot.data.remote.scene

import com.hanseo.dearshot.analysis.recommendation.RecommendationSnapshot
import javax.inject.Inject

class SceneAnalysisRequestMapper @Inject constructor() {

    fun map(
        snapshot: RecommendationSnapshot,
        uploadId: String,
        sceneRevision: Int,
        locale: String,
    ): SceneAnalysisRequest {
        require(snapshot.imageWidth > 0)
        require(snapshot.imageHeight > 0)
        require(sceneRevision >= 0)

        val width = snapshot.imageWidth.toFloat()
        val height = snapshot.imageHeight.toFloat()

        val candidates = snapshot.sceneClassification.candidates
            .filter { candidate ->
                candidate.confidence.isFinite() &&
                        candidate.confidence in 0f..1f
            }
            .sortedByDescending { it.confidence }
            .take(MAX_SCENE_CANDIDATES)
            .map { candidate ->
                SceneCandidateRequest(
                    label = candidate.label,
                    confidence = candidate.confidence,
                )
            }

        val objects = snapshot.objectDetection.objects
            .mapNotNull { detected ->
                val box = detected.box

                val valid = detected.confidence.isFinite() &&
                        detected.confidence in 0f..1f &&
                        box.left.isFinite() &&
                        box.top.isFinite() &&
                        box.right.isFinite() &&
                        box.bottom.isFinite()

                if (!valid) {
                    return@mapNotNull null
                }

                val left = (box.left / width).coerceIn(0f, 1f)
                val top = (box.top / height).coerceIn(0f, 1f)
                val right = (box.right / width).coerceIn(0f, 1f)
                val bottom = (box.bottom / height).coerceIn(0f, 1f)

                if (left >= right || top >= bottom) {
                    return@mapNotNull null
                }

                DetectedObjectRequest(
                    label = detected.label,
                    confidence = detected.confidence,
                    box = ObjectBoxRequest(
                        left = left,
                        top = top,
                        right = right,
                        bottom = bottom,
                    ),
                )
            }
            .sortedByDescending { it.confidence }
            .take(MAX_OBJECTS)

        require(candidates.isNotEmpty()) {
            "Snapshot must contain valid scene candidates"
        }

        return SceneAnalysisRequest(
            uploadId = uploadId,
            sceneRevision = sceneRevision,
            capturedAt = snapshot.capturedAt,
            locale = locale,
            deviceAnalysis = DeviceAnalysisRequest(
                sceneClassifier = SceneClassifierRequest(
                    model = "resnet18-places365",
                    modelVersion = PLACES_MODEL_VERSION,
                    runtime = ONNX_RUNTIME,
                    candidates = candidates,
                ),
                objectDetector = ObjectDetectorRequest(
                    model = "yolox-nano",
                    modelVersion = YOLOX_MODEL_VERSION,
                    runtime = ONNX_RUNTIME,
                    objects = objects,
                ),
            ),
        )
    }

    private companion object {
        const val MAX_SCENE_CANDIDATES = 5
        const val MAX_OBJECTS = 20

        const val PLACES_MODEL_VERSION = "dearshot-fp32-v1"
        const val YOLOX_MODEL_VERSION = "0.1.1rc0"
        const val ONNX_RUNTIME = "onnxruntime-android/1.31.1"
    }
}
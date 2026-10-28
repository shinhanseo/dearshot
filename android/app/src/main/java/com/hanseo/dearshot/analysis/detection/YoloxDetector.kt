package com.hanseo.dearshot.analysis.detection

import android.content.Context
import android.graphics.Bitmap
import android.os.SystemClock
import androidx.annotation.WorkerThread
import ai.onnxruntime.OnnxJavaType
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.TensorInfo
import java.io.Closeable
import kotlinx.serialization.json.Json

data class ObjectDetection(
    val objects: List<DetectedObject>,
    val imageWidth: Int,
    val imageHeight: Int,
    val processingTimeMs: Double,
)

class YoloxDetector @WorkerThread constructor(
    context: Context,
) : Closeable {

    private val environment = OrtEnvironment.getEnvironment()

    private val labels = loadLabels(
        context.applicationContext
    )

    private val preprocessor = YoloxPreprocessor()

    private val postprocessor = YoloxPostprocessor(
        labels = labels,
        scoreThreshold = 0.3f,
        iouThreshold = 0.45f,
        maxDetections = 50,
    )

    private val session = createSession(
        context.applicationContext
    )

    private var closed = false

    @WorkerThread
    @Synchronized
    fun detect(
        bitmap: Bitmap,
    ): ObjectDetection {
        check(!closed) {
            "YOLOX detector has already been closed"
        }

        val startedAt = SystemClock.elapsedRealtimeNanos()

        val input = preprocessor.process(bitmap)

        val objects = OnnxTensor.createTensor(
            environment,
            input.buffer,
            longArrayOf(
                1,
                3,
                YoloxPreprocessor.INPUT_SIZE.toLong(),
                YoloxPreprocessor.INPUT_SIZE.toLong(),
            ),
        ).use { inputTensor ->

            session.run(
                mapOf(INPUT_NAME to inputTensor)
            ).use { outputs ->

                // 실제 모델 출력은 [1, 3549, 85].
                val batches = outputs[0].value as? Array<*>

                check(batches != null && batches.size == 1) {
                    "Expected one output batch"
                }

                val rows = batches[0] as? Array<*>

                check(rows != null && rows.size == CANDIDATE_COUNT) {
                    "Expected $CANDIDATE_COUNT candidates"
                }

                val predictions = Array(rows.size) { index ->
                    val row = rows[index] as? FloatArray

                    check(
                        row != null &&
                                row.size == VALUES_PER_CANDIDATE
                    ) {
                        "Expected $VALUES_PER_CANDIDATE values " +
                                "at candidate $index"
                    }

                    row
                }

                postprocessor.process(
                    predictions = predictions,
                    input = input,
                )
            }
        }

        val elapsedNanos =
            SystemClock.elapsedRealtimeNanos() - startedAt

        return ObjectDetection(
            objects = objects,
            imageWidth = input.originalWidth,
            imageHeight = input.originalHeight,
            processingTimeMs = elapsedNanos / 1_000_000.0,
        )
    }

    private fun loadLabels(
        context: Context,
    ): List<String> {
        val content = context.assets
            .open(LABELS_PATH)
            .bufferedReader()
            .use { reader ->
                reader.readText()
            }

        val loaded =
            Json.decodeFromString<List<String>>(content)

        require(
            loaded.size == CLASS_COUNT &&
                    loaded.all { it.isNotBlank() } &&
                    loaded.first() == "person"
        ) {
            "Expected 80 COCO labels with person at index 0"
        }

        return loaded
    }

    private fun createSession(
        context: Context,
    ): OrtSession {
        val modelBytes = context.assets
            .open(MODEL_PATH)
            .use { input ->
                input.readBytes()
            }

        val created = OrtSession.SessionOptions().use { options ->
            options.setIntraOpNumThreads(2)

            options.setOptimizationLevel(
                OrtSession.SessionOptions.OptLevel.ALL_OPT
            )

            environment.createSession(
                modelBytes,
                options,
            )
        }

        try {
            validateModel(created)
            return created
        } catch (exception: Exception) {
            created.close()
            throw exception
        }
    }

    private fun validateModel(
        candidate: OrtSession,
    ) {
        require(candidate.inputNames == setOf(INPUT_NAME)) {
            "Unexpected YOLOX inputs: ${candidate.inputNames}"
        }

        require(candidate.outputNames == setOf(OUTPUT_NAME)) {
            "Unexpected YOLOX outputs: ${candidate.outputNames}"
        }

        val inputInfo =
            candidate.inputInfo.getValue(INPUT_NAME).info

        val outputInfo =
            candidate.outputInfo.getValue(OUTPUT_NAME).info

        require(inputInfo is TensorInfo) {
            "YOLOX input must be a tensor"
        }

        require(outputInfo is TensorInfo) {
            "YOLOX output must be a tensor"
        }

        require(inputInfo.type == OnnxJavaType.FLOAT) {
            "YOLOX input must use float32"
        }

        require(outputInfo.type == OnnxJavaType.FLOAT) {
            "YOLOX output must use float32"
        }

        require(
            inputInfo.shape.contentEquals(
                longArrayOf(1, 3, 416, 416)
            )
        ) {
            "Unexpected input shape: " +
                    inputInfo.shape.contentToString()
        }

        require(
            outputInfo.shape.contentEquals(
                longArrayOf(1, 3549, 85)
            )
        ) {
            "Unexpected output shape: " +
                    outputInfo.shape.contentToString()
        }
    }

    @WorkerThread
    @Synchronized
    override fun close() {
        if (closed) return

        closed = true
        session.close()
    }

    private companion object {
        const val MODEL_PATH =
            "models/yolox/yolox_nano.onnx"

        const val LABELS_PATH =
            "models/yolox/labels_coco.json"

        const val INPUT_NAME = "images"
        const val OUTPUT_NAME = "output"

        const val CLASS_COUNT = 80
        const val CANDIDATE_COUNT = 3549
        const val VALUES_PER_CANDIDATE = 85
    }
}
package com.hanseo.dearshot.analysis.scene

import android.content.Context
import android.util.Log
import androidx.annotation.WorkerThread
import ai.onnxruntime.OnnxJavaType
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import ai.onnxruntime.TensorInfo
import java.io.Closeable
import kotlinx.serialization.json.Json

class Places365Classifier @WorkerThread constructor(
    context: Context,
) : Closeable {

    private val environment = OrtEnvironment.getEnvironment()

    private val labels: List<String> = loadLabels(
        context.applicationContext
    )

    private val session: OrtSession = createSession(
        context.applicationContext
    )

    // Places365의 라벨(장소) 365개를 코틀린 리스트로 변환한다.
    private fun loadLabels(
        context: Context,
    ): List<String> {
        val json = context.assets
            .open(LABELS_PATH)
            .bufferedReader()
            .use { reader ->
                reader.readText()
            }

        val loaded = Json.decodeFromString<List<String>>(json)

        require(
            loaded.size == CLASS_COUNT &&
                    loaded.all { it.isNotBlank() }
        ) {
            "Places365 labels must contain 365 non-empty entries"
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
            // 처음에는 CPU에서 기준 결과를 확인한다.
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
            "Unexpected model inputs: ${candidate.inputNames}"
        }

        require(candidate.outputNames == setOf(OUTPUT_NAME)) {
            "Unexpected model outputs: ${candidate.outputNames}"
        }

        val inputInfo =
            candidate.inputInfo.getValue(INPUT_NAME).info

        val outputInfo =
            candidate.outputInfo.getValue(OUTPUT_NAME).info

        require(inputInfo is TensorInfo) {
            "Model input must be a tensor"
        }

        require(outputInfo is TensorInfo) {
            "Model output must be a tensor"
        }

        require(inputInfo.type == OnnxJavaType.FLOAT) {
            "Model input must use float32"
        }

        require(outputInfo.type == OnnxJavaType.FLOAT) {
            "Model output must use float32"
        }

        require(
            inputInfo.shape.contentEquals(
                longArrayOf(1, 3, 224, 224)
            )
        ) {
            "Unexpected input shape: ${inputInfo.shape.contentToString()}"
        }

        require(
            outputInfo.shape.contentEquals(
                longArrayOf(1, CLASS_COUNT.toLong())
            )
        ) {
            "Unexpected output shape: ${outputInfo.shape.contentToString()}"
        }
    }

    fun logModelInfo() {
        Log.d(
            TAG,
            "Model loaded: " +
                    "input=${session.inputInfo}, " +
                    "output=${session.outputInfo}, " +
                    "labels=${labels.size}",
        )
    }

    override fun close() {
        session.close()
    }

    private companion object {
        const val TAG = "Places365"

        const val MODEL_PATH =
            "models/places365/resnet18_places365_fp32.onnx"

        const val LABELS_PATH =
            "models/places365/labels_places365.json"

        const val INPUT_NAME = "input"
        const val OUTPUT_NAME = "logits"

        const val CLASS_COUNT = 365
    }
}
package com.hanseo.dearshot.analysis.scene

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class Places365InferenceTest {
    @Test
    fun classifiesFourSampleScenesAndWritesReport() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val directory = File(context.cacheDir, "places365-validation")
        check(directory.isDirectory || directory.mkdirs())
        val cases = listOf(
            "waterfront" to "shoreline-sunset-walk",
            "cafe" to "cafe-cheek-rest",
            "green-space" to "green-tree-lean",
            "urban-street" to "urban-crosswalk-step",
        )
        val report = JSONObject()
            .put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            .put("androidSdk", Build.VERSION.SDK_INT)
            .put("model", "resnet18_places365_fp32.onnx")
            .put("provider", "CPUExecutionProvider")
            .put("intraOpThreads", 2)
            .put("repeatCount", REPEAT_COUNT)
            .put("inputShape", JSONArray(listOf(1, 3, 224, 224)))

        val startedAt = SystemClock.elapsedRealtimeNanos()
        Places365Classifier(context).use { classifier ->
            report.put("modelLoadMs", (SystemClock.elapsedRealtimeNanos() - startedAt) / 1_000_000.0)
            classifier.logModelInfo()
            val results = JSONArray()

            cases.forEach { (category, sample) ->
                val source = File(directory, "$category.webp")
                instrumentation.context.assets.open("places365/$sample.webp").use { input ->
                    source.outputStream().use { output -> input.copyTo(output) }
                }
                val bitmap = requireNotNull(BitmapFactory.decodeFile(source.absolutePath))
                try {
                    // 첫 호출은 별도 기록하고 반복 측정에서 제외한다.
                    val first = classifier.classify(bitmap)
                    validate(first)
                    val durations = mutableListOf<Double>()
                    repeat(REPEAT_COUNT) {
                        val result = classifier.classify(bitmap)
                        validate(result)
                        assertEquals(first.candidates.map { it.index }, result.candidates.map { it.index })
                        durations += result.processingTimeMs
                    }

                    writeModelInput(bitmap, File(directory, "$category-input.png"))
                    val candidates = JSONArray()
                    first.candidates.forEach { candidate ->
                        candidates.put(
                            JSONObject()
                                .put("index", candidate.index)
                                .put("label", candidate.label)
                                .put("confidence", candidate.confidence.toDouble())
                        )
                    }
                    results.put(
                        JSONObject()
                            .put("category", category)
                            .put("sample", sample)
                            .put("sourceImage", source.name)
                            .put("modelInputImage", "$category-input.png")
                            .put("sourceWidth", bitmap.width)
                            .put("sourceHeight", bitmap.height)
                            .put("firstCallMs", first.processingTimeMs)
                            .put("warmProcessingMs", JSONArray(durations))
                            .put("candidates", candidates)
                    )
                    Log.d("Places365", "$category: ${first.candidates}; processingMs=$durations")
                } finally {
                    bitmap.recycle()
                }
            }
            report.put("results", results)
        }

        File(directory, "results.json").writeText(report.toString(2))
        Log.d("Places365", "Validation report: ${directory.absolutePath}/results.json")
    }

    private fun validate(result: SceneClassification) {
        assertEquals(5, result.candidates.size)
        assertEquals(5, result.candidates.map { it.index }.distinct().size)
        assertTrue(result.processingTimeMs.isFinite() && result.processingTimeMs >= 0)
        assertTrue(result.candidates.all {
            it.index in 0..364 && it.label.isNotBlank() &&
                it.confidence.isFinite() && it.confidence in 0f..1f
        })
        assertTrue(result.candidates.zipWithNext().all { (a, b) -> a.confidence >= b.confidence })
        assertTrue(result.candidates.sumOf { it.confidence.toDouble() } <= 1.00001)
    }

    // 실제 전처리 버퍼의 정규화를 역변환해 모델이 보는 영역을 시각화한다.
    private fun writeModelInput(source: Bitmap, file: File) {
        val input = Places365Preprocessor().process(source)
        val channelSize = 224 * 224
        fun channel(value: Float): Int = (value * 255f).toInt().coerceIn(0, 255)
        val pixels = IntArray(channelSize) { index ->
            Color.rgb(
                channel(input.get(index) * 0.229f + 0.485f),
                channel(input.get(channelSize + index) * 0.224f + 0.456f),
                channel(input.get(channelSize * 2 + index) * 0.225f + 0.406f),
            )
        }
        val bitmap = Bitmap.createBitmap(pixels, 224, 224, Bitmap.Config.ARGB_8888)
        try {
            file.outputStream().use { output ->
                check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output))
            }
        } finally {
            bitmap.recycle()
        }
    }

    private companion object {
        const val REPEAT_COUNT = 10
    }
}

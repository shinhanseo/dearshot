package com.hanseo.dearshot.analysis.detection

import android.graphics.*
import android.os.Build
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.nio.FloatBuffer
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.math.ln

@RunWith(AndroidJUnit4::class)
class YoloxValidationTest {
    private val labels = List(80) { if (it == 0) "person" else "class-$it" }

    @Test fun preprocessorPreservesBgrAndRightPadding() {
        val bitmap = Bitmap.createBitmap(208, 416, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.rgb(10, 20, 30))
        try {
            val input = YoloxPreprocessor().process(bitmap)
            val plane = 416 * 416
            assertEquals(1f, input.resizeRatio, 0f)
            assertEquals(3 * plane, input.buffer.remaining())
            assertEquals(30f, input.buffer.get(0), 0f)
            assertEquals(20f, input.buffer.get(plane), 0f)
            assertEquals(10f, input.buffer.get(2 * plane), 0f)
            for (channel in 0..2) {
                assertEquals(114f, input.buffer.get(channel * plane + 208), 0f)
                assertEquals(114f, input.buffer.get(channel * plane + plane - 1), 0f)
            }
            assertFalse(bitmap.isRecycled)
        } finally { bitmap.recycle() }
    }

    @Test fun preprocessorPreservesAspectAndBottomPadding() {
        val bitmap = Bitmap.createBitmap(832, 416, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.RED)
        try {
            val input = YoloxPreprocessor().process(bitmap)
            assertEquals(0.5f, input.resizeRatio, 0f)
            assertEquals(255f, input.buffer.get(2 * 416 * 416 + 207 * 416), 0f)
            assertEquals(114f, input.buffer.get(208 * 416), 0f)
        } finally { bitmap.recycle() }
    }

    private fun input() = YoloxInput(FloatBuffer.allocate(0), 0.5f, 832, 832)
    private fun rows() = Array(3549) { FloatArray(85) }
    private fun candidate(rows: Array<FloatArray>, index: Int, gridX: Int, gridY: Int, stride: Int, cls: Int, score: Float) {
        rows[index][0] = 100f / stride - gridX
        rows[index][1] = 120f / stride - gridY
        rows[index][2] = ln(40f / stride)
        rows[index][3] = ln(80f / stride)
        rows[index][4] = 1f
        rows[index][5 + cls] = score
    }

    @Test fun decodesAllStridesAndRestoresOriginalCoordinates() {
        for ((index, stride) in listOf(0 to 8, 2704 to 16, 3380 to 32)) {
            val predictions = rows()
            candidate(predictions, index, 0, 0, stride, 0, 0.9f)
            val result = YoloxPostprocessor(labels).process(predictions, input()).single()
            assertEquals(160f, result.box.left, 0.001f)
            assertEquals(160f, result.box.top, 0.001f)
            assertEquals(240f, result.box.right, 0.001f)
            assertEquals(320f, result.box.bottom, 0.001f)
        }
    }

    @Test fun nmsSuppressesSameClassButKeepsOtherClassAndFiltersBadScores() {
        val predictions = rows()
        candidate(predictions, 0, 0, 0, 8, 0, 0.9f)
        candidate(predictions, 1, 1, 0, 8, 0, 0.8f)
        candidate(predictions, 2, 2, 0, 8, 1, 0.7f)
        candidate(predictions, 3, 3, 0, 8, 2, 0.2f)
        candidate(predictions, 4, 4, 0, 8, 3, 0.9f)
        predictions[4][0] = Float.NaN
        val result = YoloxPostprocessor(labels).process(predictions, input())
        assertEquals(listOf(0, 1), result.map { it.classIndex })
        assertEquals(0.9f, result.first().confidence, 0f)
        assertTrue(YoloxPostprocessor(labels).process(rows(), input()).isEmpty())
    }

    @Test fun realModelDetectsCatalogImagesAndWritesVisualReport() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val directory = File(context.cacheDir, "yolox-validation").apply { mkdirs() }
        val results = JSONArray()
        val cases = listOf("shoreline-sunset-walk", "cafe-cheek-rest", "green-tree-lean", "urban-crosswalk-step")
        YoloxDetector(context).use { detector ->
            for (sample in cases) {
                val source = File(directory, "$sample.webp")
                instrumentation.context.assets.open("places365/$sample.webp").use { from -> source.outputStream().use { from.copyTo(it) } }
                val bitmap = requireNotNull(BitmapFactory.decodeFile(source.absolutePath))
                try {
                    val result = detector.detect(bitmap)
                    assertTrue("Expected a person in sample $sample", result.objects.any { it.classIndex == 0 })
                    result.objects.forEach {
                        assertTrue(it.confidence.isFinite() && it.confidence in 0.3f..1f)
                        assertTrue(it.box.left >= 0 && it.box.top >= 0)
                        assertTrue(it.box.right <= bitmap.width && it.box.bottom <= bitmap.height)
                        assertTrue(it.box.right > it.box.left && it.box.bottom > it.box.top)
                    }
                    val times = JSONArray()
                    repeat(10) {
                        val repeated = detector.detect(bitmap)
                        assertEquals(result.objects.map { it.classIndex }, repeated.objects.map { it.classIndex })
                        times.put(repeated.processingTimeMs)
                    }
                    writeInput(bitmap, File(directory, "$sample-input.png"))
                    val marked = bitmap.copy(Bitmap.Config.ARGB_8888, true)
                    try {
                        val canvas = Canvas(marked)
                        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(195, 75, 43); strokeWidth = 6f; style = Paint.Style.STROKE }
                        result.objects.forEach {
                            canvas.drawRect(it.box.left, it.box.top, it.box.right, it.box.bottom, paint)
                            paint.style = Paint.Style.FILL; paint.textSize = 32f
                            canvas.drawText("${it.label} ${"%.1f".format(java.util.Locale.US, it.confidence * 100)}%", it.box.left, (it.box.top - 12).coerceAtLeast(35f), paint)
                            paint.style = Paint.Style.STROKE
                        }
                        File(directory, "$sample-detected.png").outputStream().use { marked.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    } finally { marked.recycle() }
                    val objects = JSONArray()
                    result.objects.forEach { objects.put(JSONObject().put("label", it.label).put("confidence", it.confidence.toDouble()).put("box", JSONArray(listOf(it.box.left,it.box.top,it.box.right,it.box.bottom)))) }
                    results.put(JSONObject().put("sample",sample).put("width",bitmap.width).put("height",bitmap.height).put("firstCallMs",result.processingTimeMs).put("warmProcessingMs",times).put("objects",objects))
                } finally { bitmap.recycle() }
            }
        }
        File(directory, "results.json").writeText(JSONObject().put("device", "${Build.MANUFACTURER} ${Build.MODEL}").put("sdk",Build.VERSION.SDK_INT).put("results",results).toString(2))
    }

    private fun writeInput(source: Bitmap, file: File) {
        val input = YoloxPreprocessor().process(source)
        val plane = 416 * 416
        val pixels = IntArray(plane) { Color.rgb(input.buffer.get(2 * plane + it).toInt(), input.buffer.get(plane + it).toInt(), input.buffer.get(it).toInt()) }
        val bitmap = Bitmap.createBitmap(pixels,416,416,Bitmap.Config.ARGB_8888)
        try { file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG,100,it) } } finally { bitmap.recycle() }
    }
}

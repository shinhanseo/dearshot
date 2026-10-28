package com.hanseo.dearshot.analysis.scene

import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class Places365PreprocessorTest {
    @Test
    fun normalizesPlanarRgbWithoutRecyclingCallerBitmap() {
        val bitmap = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888)
        try {
            bitmap.eraseColor(Color.RED)
            val buffer = Places365Preprocessor().process(bitmap)
            val channelSize = 224 * 224

            assertEquals(3 * channelSize, buffer.remaining())
            assertEquals((1f - 0.485f) / 0.229f, buffer.get(0), 0.00001f)
            assertEquals((0f - 0.456f) / 0.224f, buffer.get(channelSize), 0.00001f)
            assertEquals((0f - 0.406f) / 0.225f, buffer.get(channelSize * 2), 0.00001f)
            assertFalse(bitmap.isRecycled)
        } finally {
            bitmap.recycle()
        }
    }

    @Test
    fun readsCenterCropAndPreservesPixelOrder() {
        val bitmap = Bitmap.createBitmap(256, 256, Bitmap.Config.ARGB_8888)
        try {
            bitmap.eraseColor(Color.BLUE)
            val center = IntArray(224 * 224) { Color.RED }
            center[center.lastIndex] = Color.GREEN
            bitmap.setPixels(center, 0, 224, 16, 16, 224, 224)
            val buffer = Places365Preprocessor().process(bitmap)
            val channelSize = 224 * 224

            assertEquals((1f - 0.485f) / 0.229f, buffer.get(0), 0.00001f)
            assertEquals((0f - 0.485f) / 0.229f, buffer.get(channelSize - 1), 0.00001f)
            assertEquals((1f - 0.456f) / 0.224f, buffer.get(channelSize * 2 - 1), 0.00001f)
            assertEquals((0f - 0.406f) / 0.225f, buffer.get(channelSize * 3 - 1), 0.00001f)
        } finally {
            bitmap.recycle()
        }
    }
}

package com.hanseo.dearshot.analysis.scene

import android.graphics.Bitmap
import androidx.annotation.WorkerThread
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import androidx.core.graphics.scale

class Places365Preprocessor {

    @WorkerThread
    fun process(bitmap: Bitmap): FloatBuffer {
        require(!bitmap.isRecycled) {
            "Input bitmap has already been recycled"
        }

        require(bitmap.config != Bitmap.Config.HARDWARE) {
            "Input bitmap must be a software bitmap"
        }

        // 공식 예제 기준: 먼저 256×256으로 크기 변경.
        val resized = bitmap.scale(
            width = RESIZE_SIZE,
            height = RESIZE_SIZE,
            filter = true,
        )

        try {
            val pixels = IntArray(PIXEL_COUNT)

            // 중앙 224×224 영역만 읽는다.
            // (256 - 224) / 2 = 16
            val cropOffset = (RESIZE_SIZE - INPUT_SIZE) / 2

            resized.getPixels(
                pixels,
                0,
                INPUT_SIZE,
                cropOffset,
                cropOffset,
                INPUT_SIZE,
                INPUT_SIZE,
            )

            val buffer = ByteBuffer
                .allocateDirect(
                    CHANNEL_COUNT * PIXEL_COUNT * FLOAT_BYTES
                )
                .order(ByteOrder.nativeOrder())
                .asFloatBuffer()

            for (index in pixels.indices) {
                val pixel = pixels[index]

                val red = ((pixel ushr 16) and 0xFF) / 255f
                val green = ((pixel ushr 8) and 0xFF) / 255f
                val blue = (pixel and 0xFF) / 255f

                // NCHW: R 전체 → G 전체 → B 전체 순서.
                buffer.put(
                    index,
                    (red - RED_MEAN) / RED_STD,
                )

                buffer.put(
                    PIXEL_COUNT + index,
                    (green - GREEN_MEAN) / GREEN_STD,
                )

                buffer.put(
                    PIXEL_COUNT * 2 + index,
                    (blue - BLUE_MEAN) / BLUE_STD,
                )
            }

            buffer.rewind()

            return buffer
        } finally {
            // 입력 원본은 호출한 쪽이 관리한다.
            // 크기 변경 결과가 원본과 다른 객체일 때만 정리한다.
            if (resized !== bitmap) {
                resized.recycle()
            }
        }
    }

    private companion object {
        const val RESIZE_SIZE = 256
        const val INPUT_SIZE = 224

        const val CHANNEL_COUNT = 3
        const val PIXEL_COUNT = INPUT_SIZE * INPUT_SIZE
        const val FLOAT_BYTES = 4

        const val RED_MEAN = 0.485f
        const val GREEN_MEAN = 0.456f
        const val BLUE_MEAN = 0.406f

        const val RED_STD = 0.229f
        const val GREEN_STD = 0.224f
        const val BLUE_STD = 0.225f
    }
}
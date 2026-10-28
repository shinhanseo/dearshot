package com.hanseo.dearshot.analysis.detection

import android.graphics.Bitmap
import androidx.annotation.WorkerThread
import androidx.core.graphics.scale
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.min

/**
 * YOLOX 모델 입력과 원본 좌표 복원에 필요한 정보.
 */
data class YoloxInput(
    val buffer: FloatBuffer,
    val resizeRatio: Float,
    val originalWidth: Int,
    val originalHeight: Int,
)

class YoloxPreprocessor {

    @WorkerThread
    fun process(bitmap: Bitmap): YoloxInput {
        check(!bitmap.isRecycled) {
            "Input Bitmap has already been recycled"
        }

        require(bitmap.config != Bitmap.Config.HARDWARE) {
            "A software Bitmap is required"
        }

        val originalWidth = bitmap.width
        val originalHeight = bitmap.height

        // 긴 변이 416이 되도록 비율을 유지한다.
        val ratio = min(
            INPUT_SIZE.toFloat() / originalWidth,
            INPUT_SIZE.toFloat() / originalHeight,
        )

        val resizedWidth = (originalWidth * ratio)
            .toInt()
            .coerceIn(1, INPUT_SIZE)

        val resizedHeight = (originalHeight * ratio)
            .toInt()
            .coerceIn(1, INPUT_SIZE)

        val resized = bitmap.scale(
            width = resizedWidth,
            height = resizedHeight,
            filter = true,
        )

        try {
            val pixels = IntArray(
                resizedWidth * resizedHeight
            )

            resized.getPixels(
                pixels,
                0,
                resizedWidth,
                0,
                0,
                resizedWidth,
                resizedHeight,
            )

            val buffer = ByteBuffer.allocateDirect(
                ELEMENT_COUNT * Float.SIZE_BYTES
            )
                .order(ByteOrder.nativeOrder())
                .asFloatBuffer()

            // 기본값을 114로 채워서 오른쪽·아래 패딩을 만든다.
            repeat(ELEMENT_COUNT) {
                buffer.put(PADDING_VALUE)
            }

            // 모델의 채널 순서는 B → G → R.
            for (y in 0 until resizedHeight) {
                for (x in 0 until resizedWidth) {
                    val pixel = pixels[y * resizedWidth + x]

                    val red = (pixel shr 16) and 0xFF
                    val green = (pixel shr 8) and 0xFF
                    val blue = pixel and 0xFF

                    // 리사이즈한 사진은 입력의 왼쪽 위에 배치한다.
                    val inputIndex = y * INPUT_SIZE + x

                    buffer.put(
                        inputIndex,
                        blue.toFloat(),
                    )

                    buffer.put(
                        PLANE_SIZE + inputIndex,
                        green.toFloat(),
                    )

                    buffer.put(
                        PLANE_SIZE * 2 + inputIndex,
                        red.toFloat(),
                    )
                }
            }

            buffer.rewind()

            return YoloxInput(
                buffer = buffer,
                resizeRatio = ratio,
                originalWidth = originalWidth,
                originalHeight = originalHeight,
            )
        } finally {
            // scale이 원본을 그대로 반환할 수도 있으므로 확인한다.
            if (resized !== bitmap) {
                resized.recycle()
            }
        }
    }

    companion object {
        const val INPUT_SIZE = 416

        private const val PLANE_SIZE =
            INPUT_SIZE * INPUT_SIZE

        private const val ELEMENT_COUNT =
            3 * PLANE_SIZE

        private const val PADDING_VALUE = 114f
    }
}
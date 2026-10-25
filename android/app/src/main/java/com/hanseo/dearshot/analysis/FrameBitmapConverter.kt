package com.hanseo.dearshot.analysis

import android.graphics.Bitmap
import android.graphics.Matrix
import androidx.camera.core.ImageProxy

class FrameBitmapConverter {
    fun convert(image: ImageProxy) : Bitmap {
        val source = image.toBitmap()

        try {
            val crop = image.cropRect

            val rotation = Matrix().apply {
                postRotate(
                    image.imageInfo.rotationDegrees.toFloat()
                )
            }

            val result = Bitmap.createBitmap(
                source,
                crop.left,
                crop.top,
                crop.width(),
                crop.height(),
                rotation,
                true
            )

            if (result !== source) {
                source.recycle()
            }

            return result
        } catch (exception: Exception) {
            source.recycle()
            throw exception
        }
    }
}
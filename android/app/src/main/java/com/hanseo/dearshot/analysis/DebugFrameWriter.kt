package com.hanseo.dearshot.analysis

import android.content.Context
import android.graphics.Bitmap
import java.io.File

class DebugFrameWriter(
    context: Context
) {
    private val directory = File(
        context.applicationContext.cacheDir,
        "debug-frames"
    )

    fun write(bitmap: Bitmap): File {
        check(directory.isDirectory || directory.mkdirs()) {
            "Failed to create debug frame directory"
        }

        val file = File(
            directory,
            "latest-frame.jpg",
        )

        file.outputStream().use { output ->
            check(
                bitmap.compress(
                    Bitmap.CompressFormat.JPEG,
                    95,
                    output,
                )
            ) {
                "Failed to encode debug frame"
            }
        }

        return file
    }
}

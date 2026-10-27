package com.hanseo.dearshot.data.local.photo

import android.content.Context
import java.io.File
import java.util.UUID

class CapturedPhotoStore(
    context: Context,
) {
    private val directory = File(
        context.applicationContext.filesDir,
        "captures",
    )

    fun createOutputFile(): File {
        check(directory.isDirectory || directory.mkdirs()) {
            "Failed to create capture directory"
        }

        return File(
            directory,
            "${UUID.randomUUID()}.jpg",
        )
    }
}
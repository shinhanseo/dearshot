package com.hanseo.dearshot.data.local.photo

import java.io.File

data class CapturedPhoto(
    val id : String,
    val file: File,
    val savedAtMillis: Long,
    val sizeBytes: Long,
)
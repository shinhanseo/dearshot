package com.hanseo.dearshot.data.remote.upload

import kotlinx.serialization.Serializable

@Serializable
data class UploadResponse (
    val uploadId: String,
    val status: String,
    val purpose: String,
    val contentType: String,
    val byteSize: Long,
    val width: Int,
    val height: Int,
    val expiresAt: String
)
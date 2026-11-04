package com.hanseo.dearshot.data.repository

import com.hanseo.dearshot.analysis.recommendation.RecommendationSnapshot
import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.remote.apiCall
import com.hanseo.dearshot.data.remote.upload.UploadResponse
import com.hanseo.dearshot.data.remote.upload.UploadsApi
import javax.inject.Inject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

class UploadRepository @Inject constructor(
    private val uploadsApi: UploadsApi
) {
    suspend fun uploadScreenSnapshot(
        snapshot: RecommendationSnapshot
    ) : ApiResult<UploadResponse> {
        val purpose = "SCENE_ANALYSIS".toRequestBody(
            "text/plain".toMediaType()
        )

        val imageBody = snapshot.jpegBytes.toRequestBody(
            "image/jpeg".toMediaType()
        )

        val imagePart = MultipartBody.Part.createFormData(
            name = "image",
            filename = "${snapshot.id}.jpg",
            body = imageBody
        )

        return apiCall {
            uploadsApi.upload(
                idempotencyKey = snapshot.id,
                purpose = purpose,
                image = imagePart
            )
        }
    }
}

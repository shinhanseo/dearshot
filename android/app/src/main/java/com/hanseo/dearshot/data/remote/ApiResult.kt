package com.hanseo.dearshot.data.remote

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

sealed interface ApiResult<out T> {
    data class Success<T>(val data: T) : ApiResult<T>
    data class Failure(val error: ApiFailure) : ApiResult<Nothing>
}

sealed interface ApiFailure {
    data class Http(
        val status: Int,
        val code: String?,
        val requestId: String?,
        val retryAfterSeconds: Long?,
    ) : ApiFailure

    data object Network : ApiFailure
    data object Unexpected : ApiFailure
}

@Serializable
private data class ApiErrorResponse(
    val code: String? = null,
    val requestId: String? = null,
)

private val errorJson = Json { ignoreUnknownKeys = true }

fun parseApiFailure(
    status: Int,
    errorBody: String?,
    requestIdHeader: String?,
    retryAfterHeader: String?,
): ApiFailure.Http {
    val body = errorBody?.let {
        runCatching {
            errorJson.decodeFromString<ApiErrorResponse>(it)
        }.getOrNull()
    }

    return ApiFailure.Http(
        status = status,
        code = body?.code,
        requestId = body?.requestId ?: requestIdHeader,
        retryAfterSeconds = retryAfterHeader?.toLongOrNull(),
    )
}
package com.hanseo.dearshot.data.remote

import com.hanseo.dearshot.data.remote.auth.RefreshFailedException
import java.io.IOException
import java.util.concurrent.CancellationException
import retrofit2.Response

suspend fun <T : Any> apiCall(
    emptyBodyValue: T? = null,
    request: suspend () -> Response<T>,
): ApiResult<T> {
    return try {
        val response = request()

        if (response.isSuccessful) {
            val body = response.body() ?: emptyBodyValue
            if (body != null) {
                ApiResult.Success(body)
            } else {
                ApiResult.Failure(ApiFailure.Unexpected)
            }
        } else {
            ApiResult.Failure(
                parseApiFailure(
                    status = response.code(),
                    errorBody = response.errorBody()?.string(),
                    requestIdHeader = response.headers()["X-Request-ID"],
                    retryAfterHeader = response.headers()["Retry-After"],
                )
            )
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: RefreshFailedException) {
        ApiResult.Failure(e.failure)
    } catch (e: IOException) {
        ApiResult.Failure(ApiFailure.Network)
    } catch (e: Exception) {
        ApiResult.Failure(ApiFailure.Unexpected)
    }
}

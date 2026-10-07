package com.hanseo.dearshot.data.remote.auth

import okhttp3.Interceptor
import okhttp3.RequestBody
import okhttp3.Response
import okio.BufferedSink

// 갱신 POST를 HTTP 상태 코드에 따라 OkHttp가 자동 재전송하지 않도록 한다.
internal class RefreshRequestInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val body = request.body ?: return chain.proceed(request)

        val oneShotBody = object : RequestBody() {
            override fun contentType() = body.contentType()

            override fun contentLength() = body.contentLength()

            override fun isDuplex() = body.isDuplex()

            override fun isOneShot() = true

            override fun writeTo(sink: BufferedSink) {
                body.writeTo(sink)
            }
        }

        return chain.proceed(
            request.newBuilder()
                .method(request.method, oneShotBody)
                .build()
        )
    }
}

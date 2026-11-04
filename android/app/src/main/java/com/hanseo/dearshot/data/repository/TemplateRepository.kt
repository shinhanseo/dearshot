package com.hanseo.dearshot.data.repository

import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.remote.apiCall
import com.hanseo.dearshot.data.remote.template.TemplateApi
import com.hanseo.dearshot.data.remote.template.TemplateDetailResponse
import javax.inject.Inject

class TemplateRepository @Inject constructor(
    private val api: TemplateApi,
) {
    suspend fun getDetail(
        templateId: String,
        version: Int,
        locale: String,
    ): ApiResult<TemplateDetailResponse> = apiCall {
        api.getDetail(
            templateId = templateId,
            locale = locale,
            version = version,
        )
    }
}
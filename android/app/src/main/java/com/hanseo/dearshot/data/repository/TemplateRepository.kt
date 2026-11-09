package com.hanseo.dearshot.data.repository

import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.remote.apiCall
import com.hanseo.dearshot.data.remote.template.TemplateApi
import com.hanseo.dearshot.data.remote.template.TemplateDetailResponse
import com.hanseo.dearshot.data.remote.template.TemplateListResponse
import com.hanseo.dearshot.data.remote.template.TemplateSceneResponse
import javax.inject.Inject

class TemplateRepository @Inject constructor(
    private val api: TemplateApi,
) {

    suspend fun getScenes(locale: String): ApiResult<TemplateSceneResponse> = apiCall {
        api.getScenes(locale)
    }

    suspend fun getTemplates(
        locale: String,
        scene: String? = null,
        sort: String = "recommended",
        cursor: String? = null,
        limit: Int = 20,
    ): ApiResult<TemplateListResponse> = apiCall {
        api.getTemplates(
            locale = locale,
            scene = scene,
            sort = sort,
            cursor = cursor,
            limit = limit
        )
    }

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
package com.hanseo.dearshot.ui.start

import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.data.remote.config.AppConfigResponse
import kotlinx.serialization.Serializable

@Serializable
enum class SocialLoginProvider {
    KAKAO,
    GOOGLE,
}

sealed interface StartUiState {

    data object Loading : StartUiState

    data object Maintenance : StartUiState

    data class UpdateRequired(
        val minimumSupportedVersion: String,
        val latestVersion: String,
    ) : StartUiState

    data class LoginRequired(
        val provider: SocialLoginProvider,
        val config: AppConfigResponse,
    ) : StartUiState

    data class Ready(
        val config: AppConfigResponse,
    ) : StartUiState

    data class RecoveryRequired(
        val provider: SocialLoginProvider,
        val config: AppConfigResponse,
    ) : StartUiState

    data class Error(
        val failure: ApiFailure,
    ) : StartUiState
}
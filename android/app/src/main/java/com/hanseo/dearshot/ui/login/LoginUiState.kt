package com.hanseo.dearshot.ui.login

import com.hanseo.dearshot.data.remote.ApiFailure

sealed interface LoginUiState {
    data object Idle : LoginUiState
    data object Loading : LoginUiState
    data object LoggedIn : LoginUiState

    data class Error(
        val failure: ApiFailure
    ) : LoginUiState
}
package com.hanseo.dearshot.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hanseo.dearshot.data.device.auth.KakaoLoginResult
import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.IOException
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow<LoginUiState>(LoginUiState.Idle)

    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    private var awaitingKakaoResult = false

    fun loginGuest() {
        if (isBusy()) return

        _uiState.value = LoginUiState.Loading

        viewModelScope.launch {
            _uiState.value = when(
                val result = authRepository.loginGuest()
            ) {
                is ApiResult.Success -> {
                    LoginUiState.LoggedIn
                }

                is ApiResult.Failure -> {
                    LoginUiState.Error(result.error)
                }
            }
        }
    }

    fun beginKakaoLogin(): Boolean {
        if (isBusy()) return false

        awaitingKakaoResult = true
        _uiState.value = LoginUiState.Loading

        return true
    }

    fun onKakaoLoginResult(
        result: KakaoLoginResult,
        linkGuestSession: Boolean
    ) {
        viewModelScope.launch {
            if (!awaitingKakaoResult) return@launch

            awaitingKakaoResult = false

            _uiState.value = when (result) {
                is KakaoLoginResult.Success -> {
                    when(
                        val response = authRepository.loginKakao(
                            kakaoAccessToken = result.accessToken,
                            linkGuestSession = linkGuestSession
                        )
                    ) {
                        is ApiResult.Success -> {
                            LoginUiState.LoggedIn
                        }

                        is ApiResult.Failure -> {
                            LoginUiState.Error(response.error)
                        }
                    }
                }

                KakaoLoginResult.Cancelled -> {
                    LoginUiState.Idle
                }

                is KakaoLoginResult.Failure -> {
                    val failure = if (
                        result.cause is IOException
                    ) {
                        ApiFailure.Network
                    } else {
                        ApiFailure.Unexpected
                    }

                    LoginUiState.Error(failure)
                }
            }
        }
    }

    private fun isBusy(): Boolean {
        return _uiState.value == LoginUiState.Loading ||
                _uiState.value == LoginUiState.LoggedIn
    }
}
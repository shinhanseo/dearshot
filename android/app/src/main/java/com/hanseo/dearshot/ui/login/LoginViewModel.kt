package com.hanseo.dearshot.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
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

    fun loginGuest() {
        val currentState = _uiState.value

        if ( currentState == LoginUiState.Loading || currentState == LoginUiState.LoggedIn) {
            return
        }

        _uiState.value = LoginUiState.Loading

        viewModelScope.launch {
            _uiState.value = when(
                val result = authRepository.loginGuest()
            ) {
                is ApiResult.Success -> {
                    LoginUiState.LoggedIn
                }

                is ApiResult.Failure -> {
                    LoginUiState.Error(
                        failure = result.error
                    )
                }
            }
        }
    }
}
package com.hanseo.dearshot.ui.start

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import com.hanseo.dearshot.ui.start.screens.MaintenanceScreen
import com.hanseo.dearshot.ui.start.screens.StartErrorScreen
import com.hanseo.dearshot.ui.start.screens.StartLoadingScreen
import com.hanseo.dearshot.ui.start.screens.UpdateRequiredScreen

@Composable
fun StartScreen(
    uiState: StartUiState,
    onRetry: () -> Unit,
    onUpdate: () -> Unit,
    onReady: () -> Unit,
    onLoginRequired: (SocialLoginProvider) -> Unit,
    modifier: Modifier = Modifier,
) {
    val currentOnReady by rememberUpdatedState(onReady)
    val currentOnLoginRequired by rememberUpdatedState(onLoginRequired)

    LaunchedEffect(uiState) {
        when (val state = uiState) {
            is StartUiState.Ready -> {
                currentOnReady()
            }

            is StartUiState.LoginRequired -> {
                currentOnLoginRequired(state.provider)
            }

            is StartUiState.RecoveryRequired -> {
                currentOnLoginRequired(state.provider)
            }

            else -> Unit
        }
    }

    when (val state = uiState) {
        StartUiState.Loading -> {
            StartLoadingScreen(
                modifier = modifier,
            )
        }

        StartUiState.Maintenance -> {
            MaintenanceScreen(
                onRetry = onRetry,
                modifier = modifier,
            )
        }

        is StartUiState.UpdateRequired -> {
            UpdateRequiredScreen(
                onUpdate = onUpdate,
                modifier = modifier,
            )
        }

        is StartUiState.Error -> {
            StartErrorScreen(
                failure = state.failure,
                onRetry = onRetry,
                modifier = modifier,
            )
        }

        is StartUiState.Ready,
        is StartUiState.LoginRequired,
        is StartUiState.RecoveryRequired -> {
            // 다음 화면으로 이동하기 전까지 표시한다.
            StartLoadingScreen(
                modifier = modifier,
            )
        }
    }
}
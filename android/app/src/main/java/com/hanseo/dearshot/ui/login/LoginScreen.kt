package com.hanseo.dearshot.ui.login

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.R
import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.ui.login.components.SocialLoginButton
import com.hanseo.dearshot.ui.start.SocialLoginProvider
import com.hanseo.dearshot.ui.theme.DearShotTheme

@Composable
fun LoginScreen(
    provider: SocialLoginProvider,
    uiState: LoginUiState,
    onGuestLogin: () -> Unit,
    onSocialLogin: () -> Unit,
    onLoggedIn: () -> Unit,
    modifier: Modifier = Modifier,
    showGuestLogin: Boolean = true,
    socialLoginEnabled: Boolean = false,
) {
    val currentOnLoggedIn by rememberUpdatedState(onLoggedIn)

    val isBusy =
        uiState == LoginUiState.Loading ||
                uiState == LoginUiState.LoggedIn

    LaunchedEffect(uiState) {
        if (uiState == LoginUiState.LoggedIn) {
            currentOnLoggedIn()
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .safeDrawingPadding()
            .padding(horizontal = 24.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
        )

        Spacer(modifier = Modifier.weight(1f))

        Image(
            painter = painterResource(
                R.drawable.start_loading_illustration,
            ),
            contentDescription = null,
            modifier = Modifier.size(200.dp),
            contentScale = ContentScale.Fit,
        )

        Spacer(modifier = Modifier.height(32.dp))

        Text(
            text = stringResource(R.string.app_tagline),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = stringResource(
                if (showGuestLogin) {
                    R.string.login_description
                } else {
                    R.string.login_member_description
                }
            ),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.weight(1f))

        SocialLoginButton(
            provider = provider,
            onClick = onSocialLogin,
            enabled = socialLoginEnabled && !isBusy,
            modifier = Modifier.fillMaxWidth(),
        )

        if (showGuestLogin) {
            Spacer(modifier = Modifier.height(12.dp))

            Button(
                onClick = onGuestLogin,
                enabled = !isBusy,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 52.dp),
                shape = RoundedCornerShape(12.dp),
            ) {
                if (isBusy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = MaterialTheme.colorScheme.onSurface,
                        strokeWidth = 2.dp,
                    )

                    Spacer(modifier = Modifier.size(8.dp))
                }

                Text(
                    text = stringResource(
                        if (isBusy) {
                            R.string.login_in_progress
                        } else {
                            R.string.login_guest_action
                        }
                    ),
                    style = MaterialTheme.typography.labelLarge,
                )
            }
        }

        if (uiState is LoginUiState.Error) {
            val errorMessage = when (uiState.failure) {
                ApiFailure.Network -> {
                    R.string.login_error_network
                }

                is ApiFailure.Http,
                ApiFailure.SessionRecoveryRequired,
                ApiFailure.Unexpected -> {
                    R.string.login_error_generic
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = stringResource(errorMessage),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
            )
        }

        if (showGuestLogin) {
            Spacer(modifier = Modifier.height(16.dp))

            Text(
                text = stringResource(R.string.login_guest_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Preview(
    name = "한국어",
    locale = "ko",
    showBackground = true,
    widthDp = 390,
    heightDp = 844,
)
@Composable
private fun LoginScreenKoreanPreview() {
    DearShotTheme {
        LoginScreen(
            provider = SocialLoginProvider.KAKAO,
            uiState = LoginUiState.Idle,
            onGuestLogin = {},
            onSocialLogin = {},
            onLoggedIn = {},
            socialLoginEnabled = true,
        )
    }
}

@Preview(
    name = "English",
    locale = "en",
    showBackground = true,
    widthDp = 390,
    heightDp = 844,
)
@Composable
private fun LoginScreenEnglishPreview() {
    DearShotTheme {
        LoginScreen(
            provider = SocialLoginProvider.GOOGLE,
            uiState = LoginUiState.Idle,
            onGuestLogin = {},
            onSocialLogin = {},
            onLoggedIn = {},
            socialLoginEnabled = true,
        )
    }
}

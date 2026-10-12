package com.hanseo.dearshot.ui.navigation

import android.content.ActivityNotFoundException
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import com.hanseo.dearshot.R
import com.hanseo.dearshot.ui.start.SocialLoginProvider
import com.hanseo.dearshot.ui.start.StartScreen
import com.hanseo.dearshot.ui.start.StartViewModel
import kotlinx.serialization.Serializable

@Serializable
private data object StartRoute : NavKey

@Serializable
private data object CameraRoute : NavKey

@Serializable
private data object TemplatesRoute : NavKey

@Serializable
private data class LoginRoute(
    val provider: SocialLoginProvider,
) : NavKey

@Composable
fun AppNavigation() {
    val backStack = rememberNavBackStack(StartRoute)
    val context = LocalContext.current
    val configuration = LocalConfiguration.current

    val loginProvider = if (
        configuration.locales[0].language == "ko"
    ) {
        SocialLoginProvider.KAKAO
    } else {
        SocialLoginProvider.GOOGLE
    }

    NavDisplay(
        backStack = backStack,
        entryDecorators = listOf(
            rememberSaveableStateHolderNavEntryDecorator(),
            rememberViewModelStoreNavEntryDecorator(),
        ),
        onBack = {
            if (backStack.size > 1) {
                backStack.removeLastOrNull()
            }
        },
        entryProvider = entryProvider {
            entry<StartRoute> {
                val viewModel: StartViewModel = hiltViewModel()
                val uiState by viewModel.uiState
                    .collectAsStateWithLifecycle()

                StartScreen(
                    uiState = uiState,
                    onRetry = viewModel::retry,
                    onUpdate = {
                        val storeUri =
                            "https://play.google.com/store/apps/details?id=${context.packageName}"
                                .toUri()

                        try {
                            context.startActivity(
                                Intent(Intent.ACTION_VIEW, storeUri)
                            )
                        } catch (e: ActivityNotFoundException) {
                            Toast.makeText(
                                context,
                                R.string.start_update_open_failed,
                                Toast.LENGTH_SHORT,
                            ).show()
                        }
                    },
                    onReady = {
                        backStack.clear()
                        backStack.add(CameraRoute)
                    },
                    onLoginRequired = { provider ->
                        backStack.clear()
                        backStack.add(
                            LoginRoute(provider = provider)
                        )
                    },
                )
            }

            entry<CameraRoute> {
                PlaceholderScreen(
                    title = stringResource(R.string.screen_camera),
                ) {
                    Button(
                        onClick = {
                            backStack.add(TemplatesRoute)
                        },
                    ) {
                        Text(stringResource(R.string.open_templates))
                    }

                    Button(
                        onClick = {
                            backStack.add(
                                LoginRoute(provider = loginProvider)
                            )
                        },
                    ) {
                        Text(stringResource(R.string.open_login))
                    }
                }
            }

            entry<TemplatesRoute> {
                PlaceholderScreen(
                    title = stringResource(R.string.screen_templates),
                ) {
                    Button(
                        onClick = {
                            if (backStack.size > 1) {
                                backStack.removeLastOrNull()
                            }
                        },
                    ) {
                        Text(stringResource(R.string.go_back))
                    }
                }
            }

            entry<LoginRoute> { route ->
                val providerLabel = when (route.provider) {
                    SocialLoginProvider.KAKAO -> {
                        R.string.login_provider_kakao
                    }

                    SocialLoginProvider.GOOGLE -> {
                        R.string.login_provider_google
                    }
                }

                PlaceholderScreen(
                    title = stringResource(R.string.screen_login),
                ) {
                    Text(stringResource(providerLabel))

                    if (backStack.size > 1) {
                        Button(
                            onClick = {
                                backStack.removeLastOrNull()
                            },
                        ) {
                            Text(stringResource(R.string.go_back))
                        }
                    }
                }
            }
        },
    )
}

@Composable
private fun PlaceholderScreen(
    title: String,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .safeDrawingPadding()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(
            space = 12.dp,
            alignment = Alignment.CenterVertically,
        ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title)
        content()
    }
}
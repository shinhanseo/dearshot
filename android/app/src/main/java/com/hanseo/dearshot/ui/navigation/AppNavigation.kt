package com.hanseo.dearshot.ui.navigation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.hanseo.dearshot.R
import kotlinx.serialization.Serializable

@Serializable
private data object StartRoute : NavKey

@Serializable
private data object CameraRoute : NavKey

@Serializable
private data object TemplatesRoute : NavKey

@Serializable
private data object LoginRoute : NavKey

@Composable
fun AppNavigation() {
    val backStack = rememberNavBackStack(StartRoute)

    NavDisplay(
        backStack = backStack,
        onBack = {
            if (backStack.size > 1) backStack.removeLastOrNull()
        },
        entryProvider = entryProvider {
            entry<StartRoute> {
                PlaceholderScreen(stringResource(R.string.screen_start)) {
                    Button(onClick = {
                        backStack.clear()
                        backStack.add(CameraRoute)
                    }) {
                        Text(stringResource(R.string.open_camera))
                    }
                    Button(onClick = { backStack.add(LoginRoute) }) {
                        Text(stringResource(R.string.open_login))
                    }
                }
            }

            entry<CameraRoute> {
                PlaceholderScreen(stringResource(R.string.screen_camera)) {
                    Button(onClick = { backStack.add(TemplatesRoute) }) {
                        Text(stringResource(R.string.open_templates))
                    }
                    Button(onClick = { backStack.add(LoginRoute) }) {
                        Text(stringResource(R.string.open_login))
                    }
                }
            }

            entry<TemplatesRoute> {
                PlaceholderScreen(stringResource(R.string.screen_templates)) {
                    Button(onClick = { backStack.removeLastOrNull() }) {
                        Text(stringResource(R.string.go_back))
                    }
                }
            }

            entry<LoginRoute> {
                PlaceholderScreen(stringResource(R.string.screen_login)) {
                    Button(onClick = { backStack.removeLastOrNull() }) {
                        Text(stringResource(R.string.go_back))
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
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title)
        content()
    }
}
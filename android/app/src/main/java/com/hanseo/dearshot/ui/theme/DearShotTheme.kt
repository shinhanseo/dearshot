package com.hanseo.dearshot.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DearShotColors = lightColorScheme(
    primary = Color(0xFFBD513B),
    onPrimary = Color.White,
    background = Color(0xFFF7F4EE),
    onBackground = Color(0xFF292724),
    surface = Color(0xFFF7F4EE),
    onSurface = Color(0xFF292724),
    surfaceVariant = Color(0xFFECE7DE),
    onSurfaceVariant = Color(0xFF625D56),
)

@Composable
fun DearShotTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DearShotColors,
        content = content,
    )
}
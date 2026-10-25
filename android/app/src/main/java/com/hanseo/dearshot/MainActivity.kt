package com.hanseo.dearshot

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.hanseo.dearshot.data.device.auth.GoogleLoginClient
import com.hanseo.dearshot.data.device.auth.KakaoLoginClient
import com.hanseo.dearshot.ui.navigation.AppNavigation
import com.hanseo.dearshot.ui.theme.DearShotTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var kakaoLoginClient: KakaoLoginClient

    @Inject
    lateinit var googleLoginClient: GoogleLoginClient

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        enableEdgeToEdge()

        setContent {
            DearShotApp(
                kakaoLoginClient = kakaoLoginClient,
                googleLoginClient = googleLoginClient,
            )
        }
    }
}

@Composable
private fun DearShotApp(
    kakaoLoginClient: KakaoLoginClient,
    googleLoginClient: GoogleLoginClient,
) {
    DearShotTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
        ) {
            AppNavigation(
                kakaoLoginClient = kakaoLoginClient,
                googleLoginClient = googleLoginClient,
            )
        }
    }
}
package com.hanseo.dearshot.ui.start.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.R
import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.ui.theme.DearShotTheme

@Composable
fun StartErrorScreen(
    failure: ApiFailure,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val messageRes = when (failure) {
        ApiFailure.Network -> {
            R.string.start_error_network
        }

        is ApiFailure.Http,
        ApiFailure.SessionRecoveryRequired,
        ApiFailure.Unexpected -> {
            R.string.start_error_generic
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .safeDrawingPadding()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(
            space = 16.dp,
            alignment = Alignment.CenterVertically,
        ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = stringResource(messageRes),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )

        Button(onClick = onRetry) {
            Text(
                text = stringResource(R.string.start_retry),
            )
        }
    }
}

@Preview(
    name = "한국어 · 네트워크 오류",
    locale = "ko",
    showBackground = true,
    widthDp = 390,
    heightDp = 844,
)
@Preview(
    name = "English · Network error",
    locale = "en",
    showBackground = true,
    widthDp = 390,
    heightDp = 844,
)
@Composable
private fun StartNetworkErrorScreenPreview() {
    DearShotTheme {
        StartErrorScreen(
            failure = ApiFailure.Network,
            onRetry = {},
        )
    }
}

@Preview(
    name = "한국어 · 일반 오류",
    locale = "ko",
    showBackground = true,
    widthDp = 390,
    heightDp = 844,
)
@Preview(
    name = "English · General error",
    locale = "en",
    showBackground = true,
    widthDp = 390,
    heightDp = 844,
)
@Composable
private fun StartGenericErrorScreenPreview() {
    DearShotTheme {
        StartErrorScreen(
            failure = ApiFailure.Unexpected,
            onRetry = {},
        )
    }
}
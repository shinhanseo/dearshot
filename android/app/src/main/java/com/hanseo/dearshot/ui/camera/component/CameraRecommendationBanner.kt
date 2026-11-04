package com.hanseo.dearshot.ui.camera.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.R
import com.hanseo.dearshot.ui.camera.CameraRecommendationUiState

@Composable
fun CameraRecommendationBanner(
    state: CameraRecommendationUiState,
    modifier: Modifier = Modifier,
) {
    val messageRes = when (state) {
        CameraRecommendationUiState.Idle -> return
        CameraRecommendationUiState.Loading -> R.string.camera_recommendation_loading

        is CameraRecommendationUiState.Finished -> when (state.response.status) {
            "COMPLETED" -> {
                if (state.response.result?.recommendation?.template != null) {
                    R.string.camera_recommendation_ready
                } else {
                    R.string.camera_recommendation_failed
                }
            }

            "NEEDS_USER_SELECTION" -> R.string.camera_recommendation_manual
            "CANCELLED" -> return
            else -> R.string.camera_recommendation_failed
        }

        is CameraRecommendationUiState.RequestFailed ->
            R.string.camera_recommendation_failed

        is CameraRecommendationUiState.TimedOut ->
            R.string.camera_recommendation_timeout
    }

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(24.dp),
        color = MaterialTheme.colorScheme.inverseSurface,
        contentColor = MaterialTheme.colorScheme.inverseOnSurface,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (state == CameraRecommendationUiState.Loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(14.dp),
                    color = MaterialTheme.colorScheme.inverseOnSurface,
                    strokeWidth = 2.dp,
                )
            }

            Text(
                text = stringResource(messageRes),
                style = MaterialTheme.typography.labelMedium,
            )
        }
    }
}
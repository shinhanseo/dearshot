package com.hanseo.dearshot.ui.camera.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.hanseo.dearshot.ui.camera.SceneCandidateUi
import java.text.NumberFormat
import com.hanseo.dearshot.ui.camera.AnalysisLabelResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.LocalConfiguration

@Composable
fun CameraSceneLabels(
    candidates: List<SceneCandidateUi>,
    modifier: Modifier = Modifier,
) {
    if (candidates.isEmpty()) return

    val configuration = LocalConfiguration.current
    val percentFormat = NumberFormat.getPercentInstance(
        configuration.locales[0]
    ).apply {
        maximumFractionDigits = 0
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        candidates.forEach { candidate ->
            Row(
                modifier = Modifier
                    .background(
                        color = Color(0xCC17282F),
                        shape = RoundedCornerShape(50),
                    )
                    .padding(
                        horizontal = 12.dp,
                        vertical = 8.dp,
                    ),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = AnalysisLabelResources.sceneResource(candidate.label)?.let {
                        stringResource(it)
                    } ?: AnalysisLabelResources.fallback(candidate.label),
                    color = Color.White,
                    style = MaterialTheme.typography.labelMedium,
                )

                Text(
                    text = percentFormat.format(
                        candidate.score.toDouble()
                    ),
                    color = Color.White.copy(alpha = 0.8f),
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }
    }
}
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
import java.util.Locale

@Composable
fun CameraSceneLabels(
    candidates: List<SceneCandidateUi>,
    modifier: Modifier = Modifier,
) {
    if (candidates.isEmpty()) return

    val percentFormat = NumberFormat.getPercentInstance(
        Locale.getDefault()
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
                    text = candidate.label,
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
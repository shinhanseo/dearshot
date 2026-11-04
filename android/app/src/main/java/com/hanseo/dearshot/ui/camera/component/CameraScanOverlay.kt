package com.hanseo.dearshot.ui.camera.component

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

enum class CameraScanStage {
    STABILIZING,
    RECOGNIZING,
    RECOMMENDING,
    COMPLETE,
}

@Composable
fun CameraScanOverlay(
    stage: CameraScanStage,
    message: String,
    stepLabels: List<String>,
    manualSelectionLabel: String,
    onManualSelection: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme

    Box(modifier = modifier) {
        if (
            stage == CameraScanStage.RECOGNIZING ||
            stage == CameraScanStage.RECOMMENDING
        ) {
            CameraScanLine(
                color = colors.primary,
                modifier = Modifier.matchParentSize(),
            )
        }

        if (stage != CameraScanStage.COMPLETE) {
            Surface(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(horizontal = 16.dp, vertical = 16.dp),
                shape = CircleShape,
                color = Color(0xDD17242D),
                contentColor = Color.White,
            ) {
                Text(
                    text = message,
                    modifier = Modifier.padding(horizontal = 18.dp, vertical = 9.dp),
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }

        Surface(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(horizontal = 16.dp, vertical = 12.dp)
                .fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            color = colors.surface,
            tonalElevation = 2.dp,
        ) {
            Column(
                modifier = Modifier.padding(start = 16.dp, end = 8.dp, bottom = 12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = message,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleSmall,
                    )
                    TextButton(onClick = onManualSelection) {
                        Text(
                            text = manualSelectionLabel,
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                }

                CameraScanProgress(
                    stage = stage,
                    labels = stepLabels,
                    modifier = Modifier.fillMaxWidth().padding(end = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun CameraScanProgress(
    stage: CameraScanStage,
    labels: List<String>,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme

    Box(modifier = modifier) {
        Canvas(Modifier.fillMaxWidth().height(14.dp)) {
            if (labels.size < 2) return@Canvas
            val slotWidth = size.width / labels.size

            for (index in 0 until labels.lastIndex) {
                drawLine(
                    color = if (index < stage.ordinal) colors.primary else colors.outlineVariant,
                    start = Offset(slotWidth * (index + 0.5f), center.y),
                    end = Offset(slotWidth * (index + 1.5f), center.y),
                    strokeWidth = 2.dp.toPx(),
                )
            }
        }

        Row(Modifier.fillMaxWidth()) {
            labels.forEachIndexed { index, label ->
                val completed = index < stage.ordinal
                val current = index == stage.ordinal

                Column(
                    modifier = Modifier.weight(1f),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(14.dp)
                            .background(
                                if (completed) colors.primary else colors.surface,
                                CircleShape,
                            )
                            .border(
                                2.dp,
                                if (completed || current) colors.primary else colors.outlineVariant,
                                CircleShape,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        if (current) {
                            Box(Modifier.size(5.dp).background(colors.primary, CircleShape))
                        }
                    }
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelSmall,
                        color = if (current) colors.primary else colors.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
private fun CameraScanLine(
    color: Color,
    modifier: Modifier = Modifier,
) {
    val transition = rememberInfiniteTransition(label = "camera scan")
    val position by transition.animateFloat(
        initialValue = 0.15f,
        targetValue = 0.72f,
        animationSpec = infiniteRepeatable(
            animation = tween(
                durationMillis = 1_400,
                easing = LinearEasing,
            ),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "scan line position",
    )

    Canvas(modifier = modifier) {
        val y = size.height * position

        val meshColor = Color.White.copy(alpha = 0.30f)
        val cellWidth = size.width / 4f
        val cellHeight = size.height / 5f
        for (row in 0 until 5) {
            for (column in 0 until 4) {
                val left = column * cellWidth
                val top = row * cellHeight
                drawLine(
                    color = meshColor,
                    start = Offset(left, top + cellHeight * 0.5f),
                    end = Offset(left + cellWidth * 0.5f, top),
                    strokeWidth = 1.dp.toPx(),
                )
                drawLine(
                    color = meshColor,
                    start = Offset(left + cellWidth * 0.5f, top),
                    end = Offset(left + cellWidth, top + cellHeight),
                    strokeWidth = 1.dp.toPx(),
                )
            }
        }

        val beam = Brush.horizontalGradient(
            colors = listOf(Color.Transparent, Color(0xFFBDE9FF), Color.White, color, Color.Transparent),
        )
        drawLine(beam, Offset(0f, y), Offset(size.width, y), 8.dp.toPx(), alpha = 0.24f)
        drawLine(beam, Offset(0f, y), Offset(size.width, y), 2.dp.toPx())

        listOf(0.28f, 0.54f, 0.77f).forEachIndexed { index, fraction ->
            val point = Offset(size.width * fraction, y)
            val radius = if (index == 1) 4.dp.toPx() else 3.dp.toPx()
            drawCircle(Color.White, radius, point)
            drawCircle(if (index == 0) Color(0xFF79BCD9) else color, radius - 1.dp.toPx(), point)
        }
    }
}

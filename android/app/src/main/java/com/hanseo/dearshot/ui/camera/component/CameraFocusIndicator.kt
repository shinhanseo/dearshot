package com.hanseo.dearshot.ui.camera.component

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.unit.dp

@Composable
fun CameraFocusIndicator(
    position: Offset,
    modifier: Modifier = Modifier,
    color: Color = Color.White,
) {
    Canvas(
        modifier = modifier.clipToBounds(),
    ) {
        val halfSize = 32.dp.toPx()
        val cornerLength = 19.dp.toPx()
        val crossHalfSize = 7.dp.toPx()

        val left = position.x - halfSize
        val top = position.y - halfSize
        val right = position.x + halfSize
        val bottom = position.y + halfSize

        fun drawSegment(
            start: Offset,
            end: Offset,
        ) {
            // 밝은 배경에서도 구분되도록 얇은 그림자 표시.
            drawLine(
                color = Color.Black.copy(alpha = 0.35f),
                start = start,
                end = end,
                strokeWidth = 3.dp.toPx(),
                cap = StrokeCap.Square,
            )

            drawLine(
                color = color,
                start = start,
                end = end,
                strokeWidth = 1.5.dp.toPx(),
                cap = StrokeCap.Square,
            )
        }

        // 왼쪽 위
        drawSegment(
            Offset(left, top),
            Offset(left + cornerLength, top),
        )
        drawSegment(
            Offset(left, top),
            Offset(left, top + cornerLength),
        )

        // 오른쪽 위
        drawSegment(
            Offset(right - cornerLength, top),
            Offset(right, top),
        )
        drawSegment(
            Offset(right, top),
            Offset(right, top + cornerLength),
        )

        // 왼쪽 아래
        drawSegment(
            Offset(left, bottom - cornerLength),
            Offset(left, bottom),
        )
        drawSegment(
            Offset(left, bottom),
            Offset(left + cornerLength, bottom),
        )

        // 오른쪽 아래
        drawSegment(
            Offset(right, bottom - cornerLength),
            Offset(right, bottom),
        )
        drawSegment(
            Offset(right - cornerLength, bottom),
            Offset(right, bottom),
        )

        // 중앙 십자
        drawSegment(
            Offset(position.x - crossHalfSize, position.y),
            Offset(position.x + crossHalfSize, position.y),
        )
        drawSegment(
            Offset(position.x, position.y - crossHalfSize),
            Offset(position.x, position.y + crossHalfSize),
        )
    }
}
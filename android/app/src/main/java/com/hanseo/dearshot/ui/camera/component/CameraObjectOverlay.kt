package com.hanseo.dearshot.ui.camera.component

import android.graphics.Paint
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hanseo.dearshot.ui.camera.ObjectAnalysisUi
import com.hanseo.dearshot.ui.camera.PreviewBoxMapper
import java.text.NumberFormat
import com.hanseo.dearshot.ui.camera.AnalysisLabelResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.LocalConfiguration

/** 디버그 검증용 객체 박스. 터치 입력을 소비하지 않는다. */
@Composable
fun CameraObjectOverlay(
    analysis: ObjectAnalysisUi?,
    mirror: Boolean,
    modifier: Modifier = Modifier,
) {
    if (analysis == null) return
    val density = LocalDensity.current
    val textSize = with(density) { 12.sp.toPx() }
    val padding = with(density) { 6.dp.toPx() }
    val stroke = with(density) { 1.5.dp.toPx() }
    val textPaint = remember(textSize) {
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE
            this.textSize = textSize
        }
    }
    val backgroundPaint = remember {
        Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xDD17282F.toInt() }
    }
    val configuration = LocalConfiguration.current
    val percent = NumberFormat.getPercentInstance(configuration.locales[0]).apply {
        maximumFractionDigits = 0
    }
    // stringResource는 Canvas 그리기 콜백 밖의 Composable에서 읽는다.
    val displayLabels = analysis.objects.map { detected ->
        AnalysisLabelResources.objectResource(detected.label)?.let {
            stringResource(it)
        } ?: AnalysisLabelResources.fallback(detected.label)
    }
    Canvas(modifier = modifier.clipToBounds()) {
        analysis.objects.forEachIndexed { index, detected ->
            val box = PreviewBoxMapper.map(
                detected.box, analysis.imageWidth, analysis.imageHeight,
                size.width, size.height, mirror,
            ) ?: return@forEachIndexed
            drawRect(
                color = Color(0xFFFFC9AE),
                topLeft = Offset(box.left, box.top),
                size = Size(box.right - box.left, box.bottom - box.top),
                style = Stroke(stroke),
            )
            val canvas = drawContext.canvas.nativeCanvas
            val metrics = textPaint.fontMetrics
            val height = metrics.descent - metrics.ascent + padding * 2
            val label = displayLabels[index] + " " + percent.format(detected.score.toDouble())
            val width = textPaint.measureText(label) + padding * 2
            val x = box.left.coerceIn(0f, (size.width - width).coerceAtLeast(0f))
            val y = (box.top - height).coerceIn(0f, (size.height - height).coerceAtLeast(0f))
            canvas.drawRoundRect(x, y, x + width, y + height, padding, padding, backgroundPaint)
            canvas.drawText(label, x + padding, y + padding - metrics.ascent, textPaint)
        }
    }
}

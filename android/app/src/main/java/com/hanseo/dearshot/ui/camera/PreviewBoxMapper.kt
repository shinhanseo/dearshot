package com.hanseo.dearshot.ui.camera

import kotlin.math.max

/** 크롭·회전이 완료된 분석 Bitmap 좌표를 FILL_CENTER 미리보기로 변환한다. */
object PreviewBoxMapper {
    fun map(
        box: ObjectBoxUi,
        imageWidth: Int,
        imageHeight: Int,
        viewWidth: Float,
        viewHeight: Float,
        mirror: Boolean,
    ): ObjectBoxUi? {
        if (imageWidth <= 0 || imageHeight <= 0 ||
            !viewWidth.isFinite() || !viewHeight.isFinite() ||
            viewWidth <= 0f || viewHeight <= 0f
        ) return null
        if (listOf(box.left, box.top, box.right, box.bottom).any { !it.isFinite() }) return null
        if (box.right <= box.left || box.bottom <= box.top) return null

        val scale = max(viewWidth / imageWidth, viewHeight / imageHeight)
        val offsetX = (viewWidth - imageWidth * scale) / 2f
        val offsetY = (viewHeight - imageHeight * scale) / 2f
        val sourceLeft = if (mirror) imageWidth - box.right else box.left
        val sourceRight = if (mirror) imageWidth - box.left else box.right
        val left = (sourceLeft * scale + offsetX).coerceIn(0f, viewWidth)
        val right = (sourceRight * scale + offsetX).coerceIn(0f, viewWidth)
        val top = (box.top * scale + offsetY).coerceIn(0f, viewHeight)
        val bottom = (box.bottom * scale + offsetY).coerceIn(0f, viewHeight)
        return if (right > left && bottom > top) ObjectBoxUi(left, top, right, bottom) else null
    }
}

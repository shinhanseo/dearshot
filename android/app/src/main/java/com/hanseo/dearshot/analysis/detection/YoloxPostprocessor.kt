package com.hanseo.dearshot.analysis.detection

import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min

/**
 * 원본 Bitmap 기준 픽셀 좌표.
 *
 * 카메라 화면에 표시할 때는 Preview 좌표로 추가 변환해야 한다.
 */
data class DetectionBox(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
)

data class DetectedObject(
    val classIndex: Int,
    val label: String,
    val confidence: Float,
    val box: DetectionBox,
)

class YoloxPostprocessor(
    private val labels: List<String>,
    private val scoreThreshold: Float = 0.3f,
    private val iouThreshold: Float = 0.45f,
    private val maxDetections: Int = 50,
) {
    init {
        require(labels.size == CLASS_COUNT)
        require(labels.all { it.isNotBlank() })
        require(scoreThreshold > 0f && scoreThreshold <= 1f)
        require(iouThreshold in 0f..1f)
        require(maxDetections > 0)
    }

    /**
     * 모델 출력 [1, 3549, 85]에서
     * 배치 한 개를 꺼낸 [3549, 85]를 받는다.
     */
    fun process(
        predictions: Array<FloatArray>,
        input: YoloxInput,
    ): List<DetectedObject> {
        require(predictions.size == CANDIDATE_COUNT) {
            "Expected $CANDIDATE_COUNT candidates"
        }

        require(predictions.all { it.size == VALUES_PER_CANDIDATE }) {
            "Each candidate must contain $VALUES_PER_CANDIDATE values"
        }

        require(
            input.resizeRatio.isFinite() &&
                    input.resizeRatio > 0f
        )

        require(
            input.originalWidth > 0 &&
                    input.originalHeight > 0
        )

        val candidates = mutableListOf<DetectedObject>()

        var predictionIndex = 0

        for (stride in STRIDES) {
            val gridSize = YoloxPreprocessor.INPUT_SIZE / stride

            for (gridY in 0 until gridSize) {
                for (gridX in 0 until gridSize) {
                    val prediction = predictions[predictionIndex]
                    predictionIndex += 1

                    val candidate = decodeCandidate(
                        prediction = prediction,
                        gridX = gridX,
                        gridY = gridY,
                        stride = stride,
                        input = input,
                    )

                    if (candidate != null) {
                        candidates += candidate
                    }
                }
            }
        }

        return suppressDuplicates(candidates)
    }

    private fun decodeCandidate(
        prediction: FloatArray,
        gridX: Int,
        gridY: Int,
        stride: Int,
        input: YoloxInput,
    ): DetectedObject? {
        if (prediction.any { !it.isFinite() }) return null

        val objectness = prediction[4]

        if (objectness !in 0f..1f) return null

        // 클래스 확률은 최대 1이므로 이 단계에서 건너뛸 수 있다.
        if (objectness < scoreThreshold) return null

        var bestClassIndex = -1
        var bestClassProbability = 0f

        for (classIndex in 0 until CLASS_COUNT) {
            val probability = prediction[5 + classIndex]

            if (probability !in 0f..1f) return null

            if (probability > bestClassProbability) {
                bestClassProbability = probability
                bestClassIndex = classIndex
            }
        }

        if (bestClassIndex == -1) return null

        // 모델 안에서 sigmoid가 이미 적용되어 있다.
        val confidence = objectness * bestClassProbability

        if (confidence < scoreThreshold) return null

        // 모델의 원시 좌표를 입력 이미지 좌표로 복원한다.
        val centerX = (prediction[0] + gridX) * stride
        val centerY = (prediction[1] + gridY) * stride

        val width = exp(prediction[2].toDouble())
            .toFloat() * stride

        val height = exp(prediction[3].toDouble())
            .toFloat() * stride

        if (
            !centerX.isFinite() ||
            !centerY.isFinite() ||
            !width.isFinite() ||
            !height.isFinite() ||
            width <= 0f ||
            height <= 0f
        ) {
            return null
        }

        val ratio = input.resizeRatio

        // 전처리에서 왼쪽 위에 배치했으므로
        // 패딩 오프셋을 빼지 않고 비율만 되돌린다.
        val left = ((centerX - width / 2f) / ratio)
            .coerceIn(0f, input.originalWidth.toFloat())

        val top = ((centerY - height / 2f) / ratio)
            .coerceIn(0f, input.originalHeight.toFloat())

        val right = ((centerX + width / 2f) / ratio)
            .coerceIn(0f, input.originalWidth.toFloat())

        val bottom = ((centerY + height / 2f) / ratio)
            .coerceIn(0f, input.originalHeight.toFloat())

        // 패딩 영역의 박스나 면적이 없는 박스는 제거한다.
        if (right <= left || bottom <= top) return null

        return DetectedObject(
            classIndex = bestClassIndex,
            label = labels[bestClassIndex],
            confidence = confidence,
            box = DetectionBox(
                left = left,
                top = top,
                right = right,
                bottom = bottom,
            ),
        )
    }

    /**
     * 같은 클래스끼리만 중복을 제거하는 NMS.
     */
    private fun suppressDuplicates(
        candidates: List<DetectedObject>,
    ): List<DetectedObject> {
        val sorted = candidates.sortedByDescending {
            it.confidence
        }

        val selected = mutableListOf<DetectedObject>()

        for (candidate in sorted) {
            val isDuplicate = selected.any { existing ->
                existing.classIndex == candidate.classIndex &&
                        intersectionOverUnion(
                            existing.box,
                            candidate.box,
                        ) > iouThreshold
            }

            if (!isDuplicate) {
                selected += candidate

                if (selected.size >= maxDetections) {
                    break
                }
            }
        }

        return selected
    }

    private fun intersectionOverUnion(
        first: DetectionBox,
        second: DetectionBox,
    ): Float {
        val intersectionWidth = max(
            0f,
            min(first.right, second.right) -
                    max(first.left, second.left),
        )

        val intersectionHeight = max(
            0f,
            min(first.bottom, second.bottom) -
                    max(first.top, second.top),
        )

        val intersectionArea =
            intersectionWidth * intersectionHeight

        val firstArea =
            (first.right - first.left) *
                    (first.bottom - first.top)

        val secondArea =
            (second.right - second.left) *
                    (second.bottom - second.top)

        val unionArea =
            firstArea + secondArea - intersectionArea

        return if (unionArea > 0f) {
            intersectionArea / unionArea
        } else {
            0f
        }
    }

    private companion object {
        const val CLASS_COUNT = 80
        const val VALUES_PER_CANDIDATE = 85
        const val CANDIDATE_COUNT = 3549

        val STRIDES = intArrayOf(8, 16, 32)
    }
}
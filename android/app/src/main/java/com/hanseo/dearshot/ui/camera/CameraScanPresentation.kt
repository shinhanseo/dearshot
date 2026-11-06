package com.hanseo.dearshot.ui.camera

/**
 * 추천 대기 화면에 표시할 인식 결과.
 *
 * 실시간 분석 결과와 분리해서,
 * 스캔 도중 표시 내용이 계속 바뀌는 것을 막는다.
 */
data class CameraScanPresentation(
    val scene: SceneCandidateUi?,
    val objectAnalysis: ObjectAnalysisUi?,
) {
    companion object {
        fun from(
            analysis: CameraAnalysisUiState,
        ): CameraScanPresentation {
            val scene = analysis.sceneCandidates
                .filter { candidate ->
                    candidate.score.isFinite() &&
                            candidate.score in 0f..1f
                }
                .maxByOrNull { it.score }

            val objectAnalysis = analysis.objectAnalysis
                ?.let { result ->
                    val selectedObjects = result.objects
                        .filter { detected ->
                            detected.score.isFinite() &&
                                    detected.score in 0f..1f
                        }
                        .sortedByDescending { it.score }
                        .distinctBy { it.label }
                        .take(2)

                    if (selectedObjects.isEmpty()) {
                        null
                    } else {
                        result.copy(
                            objects = selectedObjects,
                        )
                    }
                }

            return CameraScanPresentation(
                scene = scene,
                objectAnalysis = objectAnalysis,
            )
        }
    }
}
package com.hanseo.dearshot.analysis.recommendation

import com.hanseo.dearshot.analysis.detection.ObjectDetection
import com.hanseo.dearshot.analysis.scene.AppScene
import com.hanseo.dearshot.analysis.scene.SceneClassification

/**
 * 서버 추천 한 번에 사용할 사진과 분석 결과.
 *
 * jpegBytes는 생성 후 수정하지 않는다.
 * 객체 좌표는 이 JPEG 이미지의 픽셀 좌표다.
 */

class RecommendationSnapshot(
    val id: String,
    val capturedAt: String,
    val jpegBytes: ByteArray,
    val imageWidth: Int,
    val imageHeight: Int,
    val scene: AppScene,
    val sceneClassification: SceneClassification,
    val objectDetection: ObjectDetection
)
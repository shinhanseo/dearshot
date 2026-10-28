package com.hanseo.dearshot.analysis.scene

class AppSceneMapper(
    private val minimumScore: Float = 0.4f,
    private val minimumMargin: Float = 0.15f,
) {
    init {
        require(minimumScore in 0f..1f)
        require(minimumMargin in 0f..1f)
    }

    fun map(
        classification: SceneClassification,
    ): AppSceneResult {
        val candidates = classification.candidates

        require(
            candidates.all {
                it.confidence.isFinite() &&
                        it.confidence in 0f..1f
            }
        ) {
            "Scene confidence must be finite and between 0 and 1"
        }

        require(
            candidates.map { it.label }.distinct().size ==
                    candidates.size
        ) {
            "Scene labels must be unique"
        }

        val providedScore = candidates.sumOf {
            it.confidence.toDouble()
        }.toFloat()

        require(providedScore <= 1.0001f) {
            "Total probability must not exceed 1"
        }

        val totals = SUPPORTED_SCENES
            .associateWith { 0f }
            .toMutableMap()

        var unmappedScore = 0f

        for (candidate in candidates) {
            val scene = LABEL_TO_SCENE[candidate.label]

            if (scene == null) {
                unmappedScore += candidate.confidence
            } else {
                totals[scene] =
                    totals.getValue(scene) + candidate.confidence
            }
        }

        val scores = totals
            .map { (scene, score) ->
                AppSceneScore(
                    scene = scene,
                    score = score,
                )
            }
            .sortedByDescending { it.score }

        val best = scores.first()
        val runnerUp = scores[1]

        val omittedScore =
            (1f - providedScore).coerceIn(0f, 1f)

        // 서로 다른 미지원 장소의 점수를 하나의 경쟁 장소처럼 합치지 않는다.
        // 대신 가장 강한 미지원 라벨 및 다른 지원 장소와 비교한다.
        val strongestUnmapped = candidates
            .filter { it.label !in LABEL_TO_SCENE }
            .maxOfOrNull { it.confidence } ?: 0f

        val strongestAlternative = maxOf(runnerUp.score, strongestUnmapped)
        val topLabel = candidates.maxByOrNull { it.confidence }?.label
        val topLabelSupportsBest = LABEL_TO_SCENE[topLabel] == best.scene

        val canDecide =
            topLabelSupportsBest &&
                best.score >= minimumScore &&
                best.score - strongestAlternative >= minimumMargin

        return AppSceneResult(
            scene = if (canDecide) {
                best.scene
            } else {
                AppScene.UNKNOWN
            },
            scores = scores,
            unmappedScore = unmappedScore,
            omittedScore = omittedScore,
        )
    }

    private companion object {
        val SUPPORTED_SCENES = listOf(
            AppScene.WATERFRONT,
            AppScene.CAFE,
            AppScene.GREEN_SPACE,
            AppScene.URBAN_STREET,
        )

        val LABEL_TO_SCENE: Map<String, AppScene> = buildMap {
            fun register(
                scene: AppScene,
                vararg labels: String,
            ) {
                for (label in labels) {
                    check(put(label, scene) == null) {
                        "Duplicate scene mapping: $label"
                    }
                }
            }

            register(
                AppScene.WATERFRONT,
                "beach",
                "coast",
                "ocean",
                "wave",
                "lake/natural",
                "river",
                "lagoon",
                "harbor",
                "pier",
            )

            register(
                AppScene.CAFE,
                // 카페 템플릿을 적용할 수 있는 테이블 중심 다이닝 공간.
                "coffee_shop",
                "ice_cream_parlor",
                "restaurant",
                "restaurant_patio",
                "diner/outdoor",
            )

            register(
                AppScene.GREEN_SPACE,
                "park",
                "botanical_garden",
                "formal_garden",
                "japanese_garden",
                "zen_garden",
                "topiary_garden",
                "lawn",
                "yard",
                "forest/broadleaf",
                "forest_path",
                "forest_road",
                "bamboo_forest",
                "rainforest",
                "orchard",
                "picnic_area",
            )

            register(
                AppScene.URBAN_STREET,
                "street",
                "crosswalk",
                "alley",
                "plaza",
                "campus",
                "downtown",
                "building_facade",
                "shopfront",
                "residential_neighborhood",
                "apartment_building/outdoor",
                "office_building",
            )
        }
    }
}
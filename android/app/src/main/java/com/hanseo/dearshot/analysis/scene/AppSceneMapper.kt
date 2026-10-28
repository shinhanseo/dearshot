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

        // 매핑되지 않았거나 전달받지 못한 점수도
        // 불확실성으로 고려한다.
        val unsupportedScore =
            (unmappedScore + omittedScore).coerceIn(0f, 1f)

        val strongestAlternative = maxOf(
            runnerUp.score,
            unsupportedScore,
        )

        val canDecide =
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
                "coffee_shop",
                "ice_cream_parlor",
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
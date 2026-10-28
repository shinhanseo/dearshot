package com.hanseo.dearshot.analysis.recommendation

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hanseo.dearshot.analysis.scene.AppScene
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RecommendationCoordinatorTest {
    private fun readyCoordinator() = RecommendationCoordinator().apply {
        updateScene(AppScene.CAFE, 0)
        updateScene(AppScene.CAFE, 1_000)
    }

    @Test fun emitsOnceAndResetRequiresFreshEvidence() {
        val coordinator = readyCoordinator()
        assertEquals(AppScene.CAFE, coordinator.evaluate(1_100, true, 1_000)?.scene)
        assertNull(coordinator.evaluate(1_200, true, 1_200))
        coordinator.onScreenUnstable()
        coordinator.updateScene(AppScene.CAFE, 1_300)
        coordinator.updateScene(AppScene.CAFE, 2_300)
        assertNull(coordinator.evaluate(2_300, true, 2_300))
        coordinator.reset()
        assertNull(coordinator.evaluate(2_400, true, 2_400))
        coordinator.updateScene(AppScene.CAFE, 2_500)
        coordinator.updateScene(AppScene.CAFE, 3_500)
        assertNotNull(coordinator.evaluate(3_500, true, 3_500))
    }

    @Test fun rejectsMissingUnknownAndChangedScene() {
        val coordinator = RecommendationCoordinator()
        assertNull(coordinator.evaluate(1_000, true, 1_000))
        coordinator.updateScene(AppScene.UNKNOWN, 1_000)
        assertNull(coordinator.evaluate(1_000, true, 1_000))
        coordinator.updateScene(AppScene.CAFE, 1_100)
        coordinator.updateScene(AppScene.WATERFRONT, 1_200)
        assertNull(coordinator.evaluate(1_200, true, 1_200))
    }

    @Test fun recommendsWithoutAnyPersonObservationAndKeepsSceneDuringBriefInstability() {
        val coordinator = readyCoordinator()
        assertNull(coordinator.evaluate(1_100, false, 1_100))
        assertNotNull(coordinator.evaluate(1_200, true, 1_200))
    }

    @Test fun rejectsStaleSceneAndStabilityAndFutureTimestamp() {
        assertNull(readyCoordinator().evaluate(1_100, false, 1_000))
        assertNull(readyCoordinator().evaluate(1_800, true, 1_000))
        assertNull(readyCoordinator().evaluate(900, true, 1_000))
        val coordinator = readyCoordinator()
        assertNull(coordinator.evaluate(2_600, true, 2_600))
    }

    @Test fun movementAndAnalysisFailureRequireNewSceneObservations() {
        val coordinator = readyCoordinator()
        coordinator.onScreenUnstable()
        coordinator.updateScene(AppScene.CAFE, 1_200)
        assertNull(coordinator.evaluate(1_200, true, 1_200))
        coordinator.updateScene(AppScene.CAFE, 2_200)
        coordinator.invalidateScene()
        assertNull(coordinator.evaluate(2_200, true, 2_200))
    }

    @Test fun gapsAndDuplicateObservationsDoNotCountAsContinuousScene() {
        val coordinator = RecommendationCoordinator()
        coordinator.updateScene(AppScene.CAFE, 0)
        coordinator.updateScene(AppScene.CAFE, 2_000)
        assertNull(coordinator.evaluate(2_000, true, 2_000))
        coordinator.updateScene(AppScene.CAFE, 2_000)
        assertNull(coordinator.evaluate(2_000, true, 2_000))
        coordinator.updateScene(AppScene.CAFE, 3_000)
        assertNotNull(coordinator.evaluate(3_000, true, 3_000))
    }
}

package com.hanseo.dearshot.camera.motion

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hanseo.dearshot.analysis.recommendation.RecommendationCoordinator
import com.hanseo.dearshot.analysis.scene.AppScene
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GyroscopeRecommendationTest {
    private fun coordinator() = RecommendationCoordinator().apply {
        updateScene(AppScene.CAFE, 0L)
        updateScene(AppScene.CAFE, 1_000L)
    }

    @Test fun steadyGyroscopeAllowsRecommendationOnceWithoutPerson() {
        val detector = GyroscopeStabilityDetector()
        var state = CameraMotionState(CameraMotionStatus.WARMING_UP)
        for (index in 0..50) state = detector.update(.01f, .01f, .01f, index * 20_000_000L)
        assertEquals(CameraMotionStatus.STABLE, state.status)
        val coordinator = coordinator()
        assertNotNull(coordinator.evaluate(1_050L, state))
        assertNull(coordinator.evaluate(1_100L, state))
    }

    @Test fun unavailableWarmingMovingAndMissingTimestampBlockRecommendation() {
        val coordinator = coordinator()
        for (status in listOf(CameraMotionStatus.UNAVAILABLE, CameraMotionStatus.WARMING_UP, CameraMotionStatus.MOVING)) {
            assertNull(coordinator.evaluate(1_050, CameraMotionState(status, 1_000_000_000)))
        }
        assertNull(coordinator.evaluate(1_050, CameraMotionState(CameraMotionStatus.STABLE)))
        assertNotNull(coordinator.evaluate(1_050, CameraMotionState(CameraMotionStatus.STABLE,1_000_000_000)))
    }

    @Test fun oldAndFutureSensorValuesAreRejected() {
        assertNull(coordinator().evaluate(1_800,CameraMotionState(CameraMotionStatus.STABLE,1_000_000_000)))
        assertNull(coordinator().evaluate(1_000,CameraMotionState(CameraMotionStatus.STABLE,1_100_000_000)))
    }

    @Test fun slowContinuousRotationAndLargeRotationAreNotStable() {
        val detector = GyroscopeStabilityDetector()
        var state = CameraMotionState(CameraMotionStatus.WARMING_UP)
        for (index in 0..50) state = detector.update(.07f,0f,0f,index*20_000_000L)
        assertEquals(CameraMotionStatus.MOVING,state.status)
        assertEquals(CameraMotionStatus.MOVING,detector.update(1f,0f,0f,1_020_000_000L).status)
    }

    @Test fun pauseGapAndResetRequireNewHistory() {
        val detector = GyroscopeStabilityDetector()
        for (index in 0..50) detector.update(0f,0f,0f,index*20_000_000L)
        assertEquals(CameraMotionStatus.WARMING_UP,detector.update(0f,0f,0f,2_000_000_000L).status)
        detector.reset()
        assertEquals(CameraMotionStatus.WARMING_UP,detector.update(0f,0f,0f,2_020_000_000L).status)
    }
}

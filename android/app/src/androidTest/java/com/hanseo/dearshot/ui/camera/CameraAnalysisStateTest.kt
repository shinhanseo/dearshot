package com.hanseo.dearshot.ui.camera

import androidx.compose.runtime.mutableStateOf
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.hanseo.dearshot.analysis.detection.*
import com.hanseo.dearshot.analysis.scene.*
import com.hanseo.dearshot.camera.*
import com.hanseo.dearshot.data.local.photo.CapturedPhotoStore
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CameraAnalysisStateTest {
    private fun detection(objects: Boolean = true) = ObjectDetection(
        objects = if (objects) listOf(DetectedObject(0,"person",.9f,DetectionBox(10f,20f,100f,200f))) else emptyList(),
        imageWidth = 300, imageHeight = 400, processingTimeMs = 80.0,
    )
    private fun scene() = SceneClassification(listOf(SceneCandidate(99,"coffee_shop",.7f)),60.0)
    private fun withState(block: (CameraScreenState) -> Unit) {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        instrumentation.runOnMainSync {
            val context = instrumentation.targetContext
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
            val state = CameraScreenState(CameraSession(context), mutableStateOf(CameraLens.BACK), CapturedPhotoStore(context),scope)
            try { state.updateConnection(true,false,false); block(state) } finally { scope.cancel() }
        }
    }
    @Test fun sceneAndObjectsDoNotOverwriteEachOther() = withState { state ->
        state.updateObjectAnalysis(detection())
        state.updateSceneAnalysis(scene())
        assertEquals("person",state.analysisUiState.objectAnalysis!!.objects.single().label)
        assertEquals("coffee_shop",state.analysisUiState.sceneCandidates.single().label)
        state.updateObjectAnalysis(detection(false))
        assertTrue(state.analysisUiState.objectAnalysis!!.objects.isEmpty())
        assertEquals(1,state.analysisUiState.sceneCandidates.size)
    }
    @Test fun failureAndDisconnectClearOldBoxes() = withState { state ->
        state.updateObjectAnalysis(detection())
        state.updateObjectAnalysis(null)
        assertNull(state.analysisUiState.objectAnalysis)
        state.updateObjectAnalysis(detection())
        state.updateConnection(false,false,false)
        state.updateObjectAnalysis(detection())
        assertNull(state.analysisUiState.objectAnalysis)
        assertTrue(state.analysisUiState.sceneCandidates.isEmpty())
    }
    @Test fun objectsExpireWhenUpdatesStop() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main.immediate)
        lateinit var state:CameraScreenState
        try {
            instrumentation.runOnMainSync {
                val context=instrumentation.targetContext
                state=CameraScreenState(CameraSession(context),mutableStateOf(CameraLens.BACK),CapturedPhotoStore(context),scope)
                state.updateConnection(true,false,false)
                state.updateSceneAnalysis(scene())
                state.updateObjectAnalysis(detection())
            }
            Thread.sleep(1_800L)
            instrumentation.runOnMainSync {
                assertNull(state.analysisUiState.objectAnalysis)
                assertEquals(1,state.analysisUiState.sceneCandidates.size)
            }
        } finally { scope.cancel() }
    }
}

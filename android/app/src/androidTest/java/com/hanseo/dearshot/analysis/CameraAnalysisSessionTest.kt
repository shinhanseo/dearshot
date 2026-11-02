package com.hanseo.dearshot.analysis

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.hanseo.dearshot.analysis.detection.YoloxDetector
import com.hanseo.dearshot.analysis.scene.AppScene
import com.hanseo.dearshot.analysis.scene.Places365Classifier
import javax.inject.Provider
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CameraAnalysisSessionTest {
    @Test fun constructionAndClosingUnusedSessionNeverLoadModels() {
        val session = CameraAnalysisSession(
            Provider { error("Scene model must remain unloaded") },
            Provider { error("Object model must remain unloaded") },
        )
        session.close()
        session.close()
    }

    @Test fun snapshotReusesModelsAndMatchesEncodedImage() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        var sceneLoads = 0
        var objectLoads = 0
        val session = CameraAnalysisSession(
            Provider { sceneLoads++; Places365Classifier(context) },
            Provider { objectLoads++; YoloxDetector(context) },
        )
        val bitmap = instrumentation.context.assets.open("places365/cafe-cheek-rest.webp").use {
            requireNotNull(BitmapFactory.decodeStream(it))
        }
        try {
            assertEquals(0, sceneLoads)
            assertEquals(0, objectLoads)
            session.classify(bitmap)
            session.detect(bitmap)
            val snapshot = session.createSnapshot(bitmap, "2026-11-02T00:00:00Z", AppScene.CAFE)
            assertEquals(1, sceneLoads)
            assertEquals(1, objectLoads)
            assertFalse(bitmap.isRecycled)
            assertEquals(AppScene.CAFE, snapshot.scene)
            val jpeg = requireNotNull(BitmapFactory.decodeByteArray(snapshot.jpegBytes, 0, snapshot.jpegBytes.size))
            try {
                assertEquals(jpeg.width, snapshot.imageWidth)
                assertEquals(jpeg.height, snapshot.imageHeight)
                assertEquals(jpeg.width, snapshot.objectDetection.imageWidth)
                assertEquals(jpeg.height, snapshot.objectDetection.imageHeight)
                assertEquals(session.classify(jpeg).candidates, snapshot.sceneClassification.candidates)
                assertEquals(session.detect(jpeg).objects, snapshot.objectDetection.objects)
            } finally { jpeg.recycle() }
            session.close()
            session.close()
            try {
                session.classify(bitmap)
                fail("Closed analysis session must reject inference")
            } catch (_: IllegalStateException) { }
            assertEquals(1, sceneLoads)
        } finally {
            session.close()
            bitmap.recycle()
        }
    }

    @Test fun newSessionWorksAfterPreviousSessionClosesAndRejectsChangedScene() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        val bitmap = instrumentation.context.assets.open("places365/cafe-cheek-rest.webp").use {
            requireNotNull(BitmapFactory.decodeStream(it))
        }
        fun session() = CameraAnalysisSession(
            Provider { Places365Classifier(context) },
            Provider { YoloxDetector(context) },
        )
        try {
            session().use { it.classify(bitmap) }
            session().use {
                assertTrue(it.classify(bitmap).candidates.isNotEmpty())
                try {
                    it.createSnapshot(bitmap, "2026-11-02T00:00:00Z", AppScene.URBAN_STREET)
                    fail("Changed scene must be rejected")
                } catch (_: IllegalStateException) { }
                assertFalse(bitmap.isRecycled)
            }
        } finally { bitmap.recycle() }
    }
}

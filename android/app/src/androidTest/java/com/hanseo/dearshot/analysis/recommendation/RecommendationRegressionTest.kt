package com.hanseo.dearshot.analysis.recommendation

import android.graphics.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.hanseo.dearshot.analysis.*
import com.hanseo.dearshot.analysis.scene.*
import com.hanseo.dearshot.analysis.detection.YoloxDetector
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RecommendationRegressionTest {
    private fun scene(vararg values: Pair<String,Float>) = SceneClassification(values.mapIndexed { i, v -> SceneCandidate(i,v.first,v.second) },0.0)

    @Test fun reportedCafeLogMapsToCafe() {
        assertEquals(AppScene.CAFE, AppSceneMapper().map(scene("coffee_shop" to .465f,"restaurant" to .190f,"restaurant_patio" to .087f,"cafeteria" to .057f,"food_court" to .044f)).scene)
    }
    @Test fun unsupportedWinnerWeakEvidenceAndCompetingScenesStayUnknown() {
        val mapper=AppSceneMapper()
        assertEquals(AppScene.UNKNOWN,mapper.map(scene("server_room" to .185f,"computer_room" to .10f,"office" to .083f)).scene)
        assertEquals(AppScene.UNKNOWN,mapper.map(scene("restaurant_kitchen" to .45f,"coffee_shop" to .40f)).scene)
        assertEquals(AppScene.UNKNOWN,mapper.map(scene("coffee_shop" to .42f,"park" to .35f)).scene)
        assertEquals(AppScene.UNKNOWN,mapper.map(scene("coffee_shop" to .20f)).scene)
    }
    @Test fun diningSpacesShareCafeButKitchensAndFoodCourtsDoNot() {
        val mapper = AppSceneMapper()
        for (label in listOf("restaurant", "restaurant_patio", "diner/outdoor")) {
            assertEquals(label, AppScene.CAFE, mapper.map(scene(label to .75f)).scene)
        }
        for (label in listOf("restaurant_kitchen", "kitchen", "food_court", "cafeteria")) {
            assertEquals(label, AppScene.UNKNOWN, mapper.map(scene(label to .75f)).scene)
        }
        val combined = mapper.map(scene("coffee_shop" to .353f, "restaurant" to .288f, "restaurant_patio" to .082f))
        assertEquals(AppScene.CAFE, combined.scene)
        assertEquals(.723f, combined.scores.first().score, .0001f)
    }
    private fun pattern(offset: Int=0, shift: Int=0): Bitmap {
        val pixels=IntArray(128*128) { index ->
            val x=index%128; val y=index/128
            val value=if (((x+shift)/16+y/16)%2==0) 50+offset else 170+offset
            Color.rgb(value,value,value)
        }
        return Bitmap.createBitmap(pixels,128,128,Bitmap.Config.ARGB_8888)
    }
    @Test fun brightnessShiftDoesNotPreventStableScreen() {
        val detector=FrameStabilityDetector()
        for(i in 0..4) {
            val bitmap=pattern(if(i%2==0) 0 else 18)
            try {
                val result=detector.analyze(bitmap,i*250L)
                if(i==4) {
                    assertTrue(result.isStable)
                    assertTrue(requireNotNull(result.rawDifference)>.025f)
                    assertTrue(requireNotNull(result.difference)<.001f)
                }
            } finally { bitmap.recycle() }
        }
    }
    @Test fun translationAndCumulativeDriftAreRejected() {
        val detector=FrameStabilityDetector()
        for(i in 0..4) {
            val bitmap=pattern(shift=i*2)
            try { assertFalse(detector.analyze(bitmap,i*250L).isStable) } finally { bitmap.recycle() }
        }
    }
    @Test fun longGapResetsStableHistory() {
        val detector=FrameStabilityDetector(); val bitmap=pattern()
        try {
            for(i in 0..4) detector.analyze(bitmap,i*250L)
            assertFalse(detector.analyze(bitmap,2_000).isStable)
        } finally { bitmap.recycle() }
    }
    @Test fun generatedDiningPhotoMapsToCafe() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val bitmap=instrumentation.context.assets.open("recommendation/cafe-person.png").use { requireNotNull(BitmapFactory.decodeStream(it)) }
        try {
            val result=Places365Classifier(instrumentation.targetContext).use { it.classify(bitmap) }
            assertEquals(AppScene.CAFE,AppSceneMapper().map(result).scene)
        } finally { bitmap.recycle() }
    }
    @Test fun verifiedCafePhotoPassesModelsAndRepeatedFrameReadinessOnce() {
        val instrumentation=InstrumentationRegistry.getInstrumentation()
        val bitmap=instrumentation.context.assets.open("places365/cafe-cheek-rest.webp").use { requireNotNull(BitmapFactory.decodeStream(it)) }
        try {
            val classification=Places365Classifier(instrumentation.targetContext).use { it.classify(bitmap) }
            val mapped=AppSceneMapper().map(classification)
            val detection=YoloxDetector(instrumentation.targetContext).use { it.detect(bitmap) }
            android.util.Log.d("RecommendationRegression", "scene=${mapped.scene}, candidates=${classification.candidates}, people=${detection.objects.count{it.classIndex==0}}")
            assertEquals("Candidates: ${classification.candidates}", AppScene.CAFE,mapped.scene)
            assertTrue(detection.objects.any{it.classIndex==0})
            val coordinator=RecommendationCoordinator(); val stability=FrameStabilityDetector()
            var count=0
            for(i in 0..16) {
                val now=i*250L; val state=stability.analyze(bitmap,now)
                if(!state.isStable) coordinator.onScreenUnstable()
                if(i%2==0) coordinator.updatePerson(PersonPresence(true,now))
                if(i%4==0) coordinator.updateScene(mapped.scene,now)
                if(coordinator.evaluate(now,state.isStable,now)!=null) count++
            }
            assertEquals(1,count)
        } finally { bitmap.recycle() }
    }
}

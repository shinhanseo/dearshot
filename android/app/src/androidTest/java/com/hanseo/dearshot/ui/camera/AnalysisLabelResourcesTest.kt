package com.hanseo.dearshot.ui.camera

import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class AnalysisLabelResourcesTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private fun localized(language: String): Context {
        val config=Configuration(context.resources.configuration)
        config.setLocales(LocaleList.forLanguageTags(language))
        return context.createConfigurationContext(config)
    }
    private fun labels(path: String): List<String> {
        val array=context.assets.open(path).bufferedReader().use { JSONArray(it.readText()) }
        return List(array.length()) { array.getString(it) }
    }
    @Test fun allModelLabelsHaveEnglishAndKoreanDisplayResources() {
        val ko=localized("ko-KR"); val en=localized("en-US")
        val sets=listOf(
            labels("models/places365/labels_places365.json") to AnalysisLabelResources::sceneResource,
            labels("models/yolox/labels_coco.json") to AnalysisLabelResources::objectResource,
        )
        assertEquals(445,sets.sumOf { it.first.size })
        for ((labels,lookup) in sets) for(label in labels) {
            val id=requireNotNull(lookup(label)) { label }
            assertTrue(label,en.getString(id).isNotBlank())
            assertTrue(label,en.getString(id).none { it in '\uAC00'..'\uD7A3' })
            assertTrue(label,ko.getString(id).isNotBlank())
            assertNotEquals(label,en.getString(id),ko.getString(id))
        }
    }
    @Test fun appLanguageSelectsDisplayNamesAndOtherLanguagesFallBackToEnglish() {
        val person=requireNotNull(AnalysisLabelResources.objectResource("person"))
        val cafe=requireNotNull(AnalysisLabelResources.sceneResource("coffee_shop"))
        assertEquals("사람",localized("ko-KR").getString(person))
        assertEquals("카페",localized("ko-KR").getString(cafe))
        assertEquals("Person",localized("en-US").getString(person))
        assertEquals("Coffee shop",localized("ja-JP").getString(cafe))
        assertNull(AnalysisLabelResources.sceneResource("new_scene"))
        assertEquals("New scene",AnalysisLabelResources.fallback("new_scene"))
    }
}

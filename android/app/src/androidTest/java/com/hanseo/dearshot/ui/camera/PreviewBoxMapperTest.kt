package com.hanseo.dearshot.ui.camera

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PreviewBoxMapperTest {
    @Test fun sameAspectScalesAndFrontCameraMirrors() {
        val box = ObjectBoxUi(10f,20f,30f,80f)
        assertEquals(ObjectBoxUi(20f,40f,60f,160f),PreviewBoxMapper.map(box,100,200,200f,400f,false))
        assertEquals(ObjectBoxUi(140f,40f,180f,160f),PreviewBoxMapper.map(box,100,200,200f,400f,true))
    }
    @Test fun centerCropAndClippingMatchFillCenter() {
        assertEquals(ObjectBoxUi(0f,10f,50f,90f),PreviewBoxMapper.map(ObjectBoxUi(20f,10f,100f,90f),200,100,100f,100f,false))
        assertNull(PreviewBoxMapper.map(ObjectBoxUi(0f,10f,20f,90f),200,100,100f,100f,false))
    }
    @Test fun invalidDimensionsAndBoxesAreRejected() {
        val box=ObjectBoxUi(0f,0f,10f,10f)
        assertNull(PreviewBoxMapper.map(box,0,100,100f,100f,false))
        assertNull(PreviewBoxMapper.map(box,100,100,Float.NaN,100f,false))
        assertNull(PreviewBoxMapper.map(ObjectBoxUi(10f,0f,0f,10f),100,100,100f,100f,false))
    }
}

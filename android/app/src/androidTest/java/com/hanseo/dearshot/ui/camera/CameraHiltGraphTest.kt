package com.hanseo.dearshot.ui.camera

import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.hanseo.dearshot.MainActivity
import org.junit.Assert.assertNotSame
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CameraHiltGraphTest {
    @Test fun hiltViewModelCreatesIndependentCameraSessionsWithoutOpeningCamera() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val viewModel = ViewModelProvider(activity)[CameraDependenciesViewModel::class.java]
                val first = viewModel.createCameraSession()
                val second = viewModel.createCameraSession()
                assertNotSame(first, second)
                first.stop()
                second.stop()
            }
        }
    }
}

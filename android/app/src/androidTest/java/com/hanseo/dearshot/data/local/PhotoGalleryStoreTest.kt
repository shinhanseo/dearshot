package com.hanseo.dearshot.data.local

import android.graphics.Bitmap
import android.net.Uri
import android.provider.MediaStore
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.SdkSuppress
import androidx.test.platform.app.InstrumentationRegistry
import com.hanseo.dearshot.data.local.photo.CapturedPhoto
import com.hanseo.dearshot.data.local.photo.PhotoGalleryStore
import com.hanseo.dearshot.data.repository.PhotoGalleryRepository
import java.io.File
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@SdkSuppress(minSdkVersion = 29)
class PhotoGalleryStoreTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val source = File(context.cacheDir, "gallery-test-${UUID.randomUUID()}.jpg")
    private val created = mutableSetOf<Uri>()

    @After
    fun cleanUp() {
        created.forEach { context.contentResolver.delete(it, null, null) }
        source.delete()
    }

    @Test
    fun concurrentSavesPublishOneCopyAndKeepTheOriginal() = runBlocking {
        val bitmap = Bitmap.createBitmap(8, 8, Bitmap.Config.ARGB_8888)
        try {
            source.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        } finally {
            bitmap.recycle()
        }
        val photo = CapturedPhoto(UUID.randomUUID().toString(), source, source.lastModified(), source.length())
        val repository = PhotoGalleryRepository(PhotoGalleryStore(context))
        val uris = listOf(async { repository.savePhoto(photo).also { created.add(it) } },
            async { repository.savePhoto(photo).also { created.add(it) } }).awaitAll()
        assertEquals(uris[0], uris[1])
        assertEquals(uris[0], repository.getSavedUri(photo.id))
        assertTrue(source.exists())
        context.contentResolver.openInputStream(uris[0])!!.use {
            assertArrayEquals(source.readBytes(), it.readBytes())
        }
        context.contentResolver.query(uris[0], arrayOf(
            MediaStore.Images.Media.RELATIVE_PATH, MediaStore.Images.Media.IS_PENDING,
        ), null, null, null)!!.use {
            assertTrue(it.moveToFirst())
            assertEquals("Pictures/DearShot/", it.getString(0))
            assertEquals(0, it.getInt(1))
        }
    }

    @Test
    fun missingSourceIsRejected() = runBlocking {
        val photo = CapturedPhoto("missing", source, 0, 0)
        try {
            PhotoGalleryStore(context).savePhoto(photo)
            fail("Missing source must fail")
        } catch (_: IOException) {
            // Expected: no gallery entry was created.
        }
    }
}

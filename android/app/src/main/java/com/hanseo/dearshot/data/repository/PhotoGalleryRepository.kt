package com.hanseo.dearshot.data.repository

import android.net.Uri
import com.hanseo.dearshot.data.local.photo.CapturedPhoto
import com.hanseo.dearshot.data.local.photo.PhotoGalleryStore
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

@Singleton
class PhotoGalleryRepository @Inject constructor(
    private val galleryStore: PhotoGalleryStore,
) {
    private val mutex = Mutex()
    private val savedUris = mutableMapOf<String, Uri>()

    fun getSavedUri(photoId: String): Uri? = savedUris[photoId]

    suspend fun savePhoto(photo: CapturedPhoto): Uri = mutex.withLock {
        savedUris[photo.id]?.let { return@withLock it }
        val uri = galleryStore.savePhoto(photo)
        savedUris[photo.id] = uri
        uri
    }
}

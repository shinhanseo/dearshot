package com.hanseo.dearshot.data.repository

import com.hanseo.dearshot.data.local.photo.CapturedPhoto
import com.hanseo.dearshot.data.local.photo.CapturedPhotoStore
import javax.inject.Inject

class CapturedPhotoRepository @Inject constructor(
    private val photoStore: CapturedPhotoStore,
) {
    suspend fun getPhotos(): List<CapturedPhoto> {
        return photoStore.getPhotos()
    }
}
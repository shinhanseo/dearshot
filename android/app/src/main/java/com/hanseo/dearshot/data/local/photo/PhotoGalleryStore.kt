package com.hanseo.dearshot.data.local.photo

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.IOException
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

@Singleton
class PhotoGalleryStore @Inject constructor(
    @param:ApplicationContext private val context: Context,
) {

    suspend fun savePhoto(
        photo: CapturedPhoto,
    ): Uri = withContext(Dispatchers.IO) {
        val source = photo.file

        if (!source.isFile || source.length() <= 0L) {
            throw IOException("Source photo is missing or empty")
        }

        checkLegacyPermission()

        val resolver = context.contentResolver

        val displayName =
            "DearShot_${photo.id}_${UUID.randomUUID()}.jpg"

        val legacyFile = if (
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
        ) {
            createLegacyDestination(displayName)
        } else {
            null
        }

        val values = ContentValues().apply {
            put(
                MediaStore.Images.Media.DISPLAY_NAME,
                displayName,
            )

            put(
                MediaStore.Images.Media.MIME_TYPE,
                "image/jpeg",
            )

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(
                    MediaStore.Images.Media.RELATIVE_PATH,
                    "${Environment.DIRECTORY_PICTURES}/DearShot",
                )

                // 복사가 끝날 때까지 다른 앱에 공개하지 않는다.
                put(
                    MediaStore.Images.Media.IS_PENDING,
                    1,
                )
            } else {
                @Suppress("DEPRECATION")
                put(
                    MediaStore.Images.Media.DATA,
                    requireNotNull(legacyFile).absolutePath,
                )
            }
        }

        val collection = if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        ) {
            MediaStore.Images.Media.getContentUri(
                MediaStore.VOLUME_EXTERNAL_PRIMARY,
            )
        } else {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }

        currentCoroutineContext().ensureActive()

        val uri = resolver.insert(collection, values)
            ?: throw IOException(
                "Failed to create gallery entry",
            )

        try {
            source.inputStream().use { input ->
                val output = resolver.openOutputStream(uri, "w")
                    ?: throw IOException(
                        "Failed to open gallery output stream",
                    )

                output.use {
                    input.copyTo(it)
                }
            }

            currentCoroutineContext().ensureActive()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val published = resolver.update(
                    uri,
                    ContentValues().apply {
                        put(
                            MediaStore.Images.Media.IS_PENDING,
                            0,
                        )
                    },
                    null,
                    null,
                )

                if (published != 1) {
                    throw IOException(
                        "Failed to publish gallery photo",
                    )
                }
            }

            uri
        } catch (error: Throwable) {
            // 실패하거나 취소되면 이번에 만든 미완성 항목을 정리한다.
            try {
                resolver.delete(uri, null, null)
            } catch (cleanupError: Throwable) {
                error.addSuppressed(cleanupError)
            }

            // 구형 Android에서 남을 수 있는 목적지 파일도 정리한다.
            try {
                if (legacyFile?.exists() == true) {
                    if (!legacyFile.delete()) {
                        throw IOException(
                            "Failed to remove incomplete gallery file",
                        )
                    }
                }
            } catch (cleanupError: Throwable) {
                error.addSuppressed(cleanupError)
            }

            throw error
        }
    }

    private fun checkLegacyPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return
        }

        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.WRITE_EXTERNAL_STORAGE,
        ) == PackageManager.PERMISSION_GRANTED

        if (!granted) {
            throw SecurityException(
                "Storage permission is required on Android 8–9",
            )
        }
    }

    @Suppress("DEPRECATION")
    private fun createLegacyDestination(
        displayName: String,
    ): File {
        val directory = File(
            Environment.getExternalStoragePublicDirectory(
                Environment.DIRECTORY_PICTURES,
            ),
            "DearShot",
        )

        if (
            !directory.isDirectory &&
            !directory.mkdirs() &&
            !directory.isDirectory
        ) {
            throw IOException(
                "Failed to create gallery directory",
            )
        }

        return File(directory, displayName)
    }
}
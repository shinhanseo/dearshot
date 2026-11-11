package com.hanseo.dearshot.data.local.photo

import android.content.Context
import androidx.annotation.WorkerThread
import java.io.File
import java.io.IOException
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CapturedPhotoStore @Inject constructor(
    @ApplicationContext context: Context,
    captureSessionStore: CaptureSessionStore,
) {
    private val directory = File(
        context.applicationContext.filesDir,
        "captures/${captureSessionStore.sessionId}",
    )

    private val _photoCount = MutableStateFlow(0)
    val photoCount = _photoCount.asStateFlow()

    /** CameraX 저장 성공 시 호출한다. 화면 이동과 무관하게 세션 개수를 유지한다. */
    fun onPhotoSaved() {
        _photoCount.update { it + 1 }
    }

    /**
     * CameraX가 촬영 결과를 저장할 파일 경로를 만든다.
     *
     * 실제 사진 파일은 촬영 과정에서 생성된다.
     */
    @WorkerThread
    fun createOutputFile(): File {
        ensureDirectory()

        return File(
            directory,
            "${UUID.randomUUID()}.jpg",
        )
    }

    /**
     * 현재 세션 폴더의 사진만 최신순으로 조회한다.
     */
    suspend fun getPhotos(): List<CapturedPhoto> =
        withContext(Dispatchers.IO) {
            if (!directory.exists()) {
                return@withContext emptyList()
            }

            if (!directory.isDirectory) {
                throw IOException(
                    "Capture path is not a directory",
                )
            }

            val files = directory.listFiles()
                ?: throw IOException(
                    "Failed to read capture directory",
                )

            files
                .asSequence()
                .filter { file ->
                    file.isFile &&
                            file.extension.equals(
                                other = "jpg",
                                ignoreCase = true,
                            )
                }
                .mapNotNull { file ->
                    val sizeBytes = file.length()

                    // 실패한 촬영 등으로 생긴 빈 파일은 표시하지 않는다.
                    if (sizeBytes <= 0L) {
                        return@mapNotNull null
                    }

                    CapturedPhoto(
                        id = file.nameWithoutExtension,
                        file = file,
                        savedAtMillis = file.lastModified(),
                        sizeBytes = sizeBytes,
                    )
                }
                .sortedWith(
                    compareByDescending<CapturedPhoto> {
                        it.savedAtMillis
                    }.thenBy {
                        it.id
                    },
                )
                .toList()
        }

    @WorkerThread
    private fun ensureDirectory() {
        if (directory.isDirectory) {
            return
        }

        if (!directory.mkdirs() && !directory.isDirectory) {
            throw IOException(
                "Failed to create capture directory",
            )
        }
    }
}

package com.hanseo.dearshot.data.local.security

import android.content.Context
import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStore
import androidx.datastore.core.FileStorage
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferencesFileSerializer
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStoreFile
import androidx.datastore.tink.AeadSerializer
import com.google.crypto.tink.integration.android.AndroidKeystore
import java.io.File
import java.security.GeneralSecurityException
import javax.crypto.BadPaddingException
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

internal class EncryptedTokenDataStore(
    context: Context,
    private val file: File = context.preferencesDataStoreFile("auth_tokens_secure"),
    private val keyAlias: String = "dearshot_auth_datastore_v1",
    private val coroutineContext: CoroutineContext = Dispatchers.IO + SupervisorJob(),
) {
    private val mutex = Mutex()
    private var instance: DataStore<Preferences>? = null

    suspend fun get(): DataStore<Preferences> = mutex.withLock {
        instance ?: withContext(Dispatchers.IO) { create() }.also { instance = it }
    }

    private fun create(): DataStore<Preferences> {
        if (!AndroidKeystore.hasKey(keyAlias)) {
            AndroidKeystore.generateNewAes256GcmKey(keyAlias)
        }
        val serializer = AeadSerializer(
            aead = AndroidKeystore.getAead(keyAlias),
            wrappedSerializer = PreferencesFileSerializer,
            associatedData = ASSOCIATED_DATA,
        )

        return DataStore.Builder(
            storage = FileStorage(serializer = serializer, produceFile = { file }),
            context = coroutineContext,
        )
            .setCorruptionHandler(ReplaceFileCorruptionHandler(::recoverCorruption))
            .build()
    }

    internal companion object {
        val ASSOCIATED_DATA: ByteArray = "dearshot.auth.datastore:v1".encodeToByteArray()

        fun recoverCorruption(error: CorruptionException): Preferences {
            val cause = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<GeneralSecurityException>()
                .firstOrNull()
            if (cause is GeneralSecurityException && cause !is BadPaddingException) {
                throw cause
            }
            return emptyPreferences()
        }
    }
}

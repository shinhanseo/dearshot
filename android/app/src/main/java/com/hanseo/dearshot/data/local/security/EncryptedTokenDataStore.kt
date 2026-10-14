package com.hanseo.dearshot.data.local.security

import android.content.Context
import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStore
import androidx.datastore.core.FileStorage
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferencesFileSerializer
import androidx.datastore.preferences.core.preferencesOf
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
    private val legacyFile: File = context.preferencesDataStoreFile("auth_tokens"),
    private val keyAlias: String = "dearshot_auth_datastore_v1",
    private val legacyKeyAlias: String = "dearshot_auth_tokens_v1",
    private val coroutineContext: CoroutineContext = Dispatchers.IO + SupervisorJob(),
) {
    private val mutex = Mutex()
    private var instance: DataStore<Preferences>? = null

    // Hilt construction stays cheap. Keystore initialization runs once, on IO.
    suspend fun get(): DataStore<Preferences> = mutex.withLock {
        instance ?: withContext(Dispatchers.IO) { create() }.also { instance = it }
    }

    private fun create(): DataStore<Preferences> {
        // This API never falls back to storing a key in plaintext.
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
            .addMigrations(listOf(
                LegacyTokenMigration(
                    file = legacyFile,
                    keyAlias = legacyKeyAlias,
                    // Even an empty/truncated destination must not resurrect an older session.
                    importLegacy = !file.exists(),
                ),
            ))
            .build()
    }

    internal companion object {
        val ASSOCIATED_DATA: ByteArray = "dearshot.auth.datastore:v1".encodeToByteArray()

        fun recoverCorruption(error: CorruptionException): Preferences {
            // FileStorage may wrap the serializer's CorruptionException again.
            val cause = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<GeneralSecurityException>()
                .firstOrNull()
            // A transient Keystore failure is not proof of file corruption.
            if (cause is GeneralSecurityException && cause !is BadPaddingException) {
                throw cause
            }
            // Invalid ciphertext/key loss: return to login, without importing old tokens again.
            return preferencesOf(LegacyTokenMigration.COMPLETED to true)
        }
    }
}

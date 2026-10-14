package com.hanseo.dearshot.data.local

import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.core.FileStorage
import androidx.datastore.core.Serializer
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferencesFileSerializer
import androidx.datastore.preferences.core.preferencesOf
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.datastore.tink.AeadSerializer
import com.google.crypto.tink.Aead
import com.google.crypto.tink.integration.android.AndroidKeystore
import com.hanseo.dearshot.data.local.security.EncryptedTokenDataStore
import com.hanseo.dearshot.data.local.security.LegacyTokenMigration
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.util.UUID
import javax.crypto.BadPaddingException
import javax.crypto.Cipher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TokenStoreTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val id = UUID.randomUUID().toString()
    private val directory = File(context.cacheDir, "token-store-test-$id").apply { mkdirs() }
    private val secureFile = File(directory, "secure.preferences_pb")
    private val legacyFile = File(directory, "legacy.preferences_pb")
    private val keyAlias = "dearshot_test_secure_$id"
    private val legacyKeyAlias = "dearshot_test_legacy_$id"
    private val jobs = mutableListOf<Job>()
    private val initial = AuthTokens("test-access-$id", "test-refresh-$id")

    private fun open(): TokenStore {
        val job = SupervisorJob().also { jobs += it }
        val factory = EncryptedTokenDataStore(
            context = context,
            file = secureFile,
            legacyFile = legacyFile,
            keyAlias = keyAlias,
            legacyKeyAlias = legacyKeyAlias,
            coroutineContext = Dispatchers.IO + job,
        )
        return TokenStore(factory::get)
    }

    private suspend fun closeStores() {
        jobs.forEach { it.cancelAndJoin() }
        jobs.clear()
    }

    @After
    fun cleanUp() = runBlocking {
        closeStores()
        AndroidKeystore.deleteKey(keyAlias)
        AndroidKeystore.deleteKey(legacyKeyAlias)
        check(directory.deleteRecursively())
    }

    @Test
    fun fileIsEncryptedAndCanBeReopenedWithSameKey() = runBlocking {
        val store = open()
        store.save(initial)
        val bytes = secureFile.readBytes()
        val rawText = bytes.toString(Charsets.ISO_8859_1)
        assertFalse(rawText.contains(initial.accessToken))
        assertFalse(rawText.contains(initial.refreshToken))
        assertFalse(initial.toString().contains(initial.accessToken))
        assertFalse(initial.toString().contains(initial.refreshToken))

        try {
            AndroidKeystore.getAead(keyAlias).decrypt(bytes, "wrong-context".encodeToByteArray())
            fail("Different associated data must fail authentication")
        } catch (_: BadPaddingException) { /* Expected authentication failure. */ }

        closeStores()
        assertEquals(initial, open().getTokens())
    }

    @Test
    fun concurrentRefreshOnlyReplacesTheExpectedPairOnce() = runBlocking {
        val store = open()
        store.save(initial)
        val replacements = (1..20).map { AuthTokens("access-$it", "refresh-$it") }
        val results = replacements.map { replacement ->
            async(Dispatchers.Default) { store.replaceIfCurrent(initial, replacement) }
        }.awaitAll()
        assertEquals(1, results.count { it })
        assertTrue(store.getTokens() in replacements)
    }

    @Test
    fun staleRefreshCannotUndoLogoutOrReplaceAnotherLogin() = runBlocking {
        val store = open()
        store.save(initial)
        store.clear()
        assertFalse(store.replaceIfCurrent(initial, AuthTokens("late", "late-refresh")))
        assertNull(store.getTokens())
        val another = AuthTokens("another", "another-refresh")
        assertTrue(store.replaceIfCurrent(null, another))
        assertFalse(store.replaceIfCurrent(initial, initial))
        assertEquals(another, store.getTokens())
    }

    @Test
    fun plaintextLegacyPairIsImportedAndOldFileRemoved() = runBlocking {
        writeLegacy(preferencesOf(
            TokenStore.ACCESS_TOKEN to initial.accessToken,
            TokenStore.REFRESH_TOKEN to initial.refreshToken,
        ))
        assertEquals(initial, open().getTokens())
        assertFalse(legacyFile.exists())
        assertFalse(secureFile.readBytes().toString(Charsets.ISO_8859_1).contains(initial.accessToken))
    }

    @Test
    fun oldCipherFormatIsImportedUsingTheExistingKeystoreKey() = runBlocking {
        AndroidKeystore.generateNewAes256GcmKey(legacyKeyAlias)
        writeLegacy(preferencesOf(
            stringPreferencesKey("encrypted_access_token") to oldEncrypt(initial.accessToken, "ACCESS_TOKEN"),
            stringPreferencesKey("encrypted_refresh_token") to oldEncrypt(initial.refreshToken, "REFRESH_TOKEN"),
        ))
        assertEquals(initial, open().getTokens())
        assertFalse(legacyFile.exists())
    }

    @Test
    fun tamperedFileReturnsToLoginWithoutResurrectingLegacyTokens() = runBlocking {
        open().save(initial)
        closeStores()
        writeLegacy(preferencesOf(
            TokenStore.ACCESS_TOKEN to "stale-access",
            TokenStore.REFRESH_TOKEN to "stale-refresh",
        ))
        val bytes = secureFile.readBytes()
        bytes[bytes.lastIndex] = (bytes.last().toInt() xor 1).toByte()
        secureFile.writeBytes(bytes)
        val store = open()
        assertNull(store.getTokens())
        assertFalse(legacyFile.exists())
        store.save(initial)
        assertEquals(initial, store.getTokens())
    }

    @Test
    fun lostKeyReturnsToLoginAndAllowsNewTokensToBeSaved() = runBlocking {
        open().save(initial)
        closeStores()
        AndroidKeystore.deleteKey(keyAlias)
        val store = open()
        assertNull(store.getTokens())
        store.save(initial)
        closeStores()
        assertEquals(initial, open().getTokens())
    }

    @Test
    fun truncatedFileDoesNotImportAnOlderSession() = runBlocking {
        open().save(initial)
        closeStores()
        secureFile.writeBytes(byteArrayOf())
        writeLegacy(preferencesOf(
            TokenStore.ACCESS_TOKEN to "stale-access",
            TokenStore.REFRESH_TOKEN to "stale-refresh",
        ))
        val store = open()
        assertNull(store.getTokens())
        assertFalse(legacyFile.exists())
        store.save(initial)
        assertEquals(initial, store.getTokens())
    }

    @Test
    fun incompleteEncryptedLegacyPairDoesNotFallBackToPlaintext() = runBlocking {
        writeLegacy(preferencesOf(
            stringPreferencesKey("encrypted_access_token") to "v1:invalid:invalid",
            TokenStore.ACCESS_TOKEN to initial.accessToken,
            TokenStore.REFRESH_TOKEN to initial.refreshToken,
        ))
        assertNull(open().getTokens())
        assertFalse(legacyFile.exists())
    }

    @Test
    fun transientCryptoFailurePreservesTheEncryptedFile() = runBlocking {
        open().save(initial)
        closeStores()
        val originalBytes = secureFile.readBytes()
        val failure = GeneralSecurityException("Simulated temporary provider failure")
        val realAead = AndroidKeystore.getAead(keyAlias)
        val failingAead = object : Aead {
            override fun encrypt(plaintext: ByteArray, associatedData: ByteArray): ByteArray =
                realAead.encrypt(plaintext, associatedData)
            override fun decrypt(ciphertext: ByteArray, associatedData: ByteArray): ByteArray = throw failure
        }
        val serializer = AeadSerializer(failingAead, PreferencesFileSerializer,
            EncryptedTokenDataStore.ASSOCIATED_DATA)
        val job = SupervisorJob().also { jobs += it }
        val dataStore = DataStore.Builder(
            FileStorage(serializer = serializer, produceFile = { secureFile }),
            Dispatchers.IO + job,
        ).setCorruptionHandler(ReplaceFileCorruptionHandler(EncryptedTokenDataStore::recoverCorruption))
            .build()
        try {
            dataStore.data.first()
            fail("A temporary crypto error must be surfaced")
        } catch (error: GeneralSecurityException) {
            assertSame(failure, error)
        }
        assertArrayEquals(originalBytes, secureFile.readBytes())
    }

    @Test
    fun failedDestinationWriteDoesNotDeleteLegacyTokens() = runBlocking {
        writeLegacy(preferencesOf(
            TokenStore.ACCESS_TOKEN to initial.accessToken,
            TokenStore.REFRESH_TOKEN to initial.refreshToken,
        ))
        val failingSerializer = object : Serializer<Preferences> {
            override val defaultValue = PreferencesFileSerializer.defaultValue
            override suspend fun readFrom(input: InputStream) = PreferencesFileSerializer.readFrom(input)
            override suspend fun writeTo(t: Preferences, output: OutputStream) {
                throw IOException("Simulated destination write failure")
            }
        }
        val job = SupervisorJob().also { jobs += it }
        val dataStore = DataStore.Builder(
            FileStorage(serializer = failingSerializer, produceFile = { secureFile }),
            Dispatchers.IO + job,
        ).addMigrations(listOf(LegacyTokenMigration(legacyFile, legacyKeyAlias))).build()
        try {
            dataStore.data.first()
            fail("Migration must surface a destination write failure")
        } catch (_: IOException) { /* Expected. */ }
        assertTrue(legacyFile.exists())
        closeStores()
        assertEquals(initial, open().getTokens())
        assertFalse(legacyFile.exists())
    }

    private suspend fun writeLegacy(preferences: Preferences) {
        legacyFile.outputStream().use { PreferencesFileSerializer.writeTo(preferences, it) }
    }

    // Fixture matches the removed implementation, independently of Tink's encryption code.
    private fun oldEncrypt(value: String, field: String): String {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, keyStore.getKey(legacyKeyAlias, null))
        cipher.updateAAD("dearshot.auth:v1:$field".encodeToByteArray())
        val encrypted = cipher.doFinal(value.encodeToByteArray())
        return "v1:${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}:" +
            Base64.encodeToString(encrypted, Base64.NO_WRAP)
    }
}

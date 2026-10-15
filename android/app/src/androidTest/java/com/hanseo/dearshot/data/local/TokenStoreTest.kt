package com.hanseo.dearshot.data.local

import androidx.datastore.core.DataStore
import androidx.datastore.core.FileStorage
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.PreferencesFileSerializer
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.datastore.tink.AeadSerializer
import com.google.crypto.tink.Aead
import com.google.crypto.tink.integration.android.AndroidKeystore
import com.hanseo.dearshot.data.local.security.EncryptedTokenDataStore
import java.io.File
import java.security.GeneralSecurityException
import java.util.UUID
import javax.crypto.BadPaddingException
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
    private val keyAlias = "dearshot_test_secure_$id"
    private val jobs = mutableListOf<Job>()
    private val initial = AuthTokens("test-access-$id", "test-refresh-$id")

    private fun open(): TokenStore {
        val job = SupervisorJob().also { jobs += it }
        val factory = EncryptedTokenDataStore(
            context = context,
            file = secureFile,
            keyAlias = keyAlias,
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
    fun tamperedFileClearsTokensAndAllowsNewTokensToBeSaved() = runBlocking {
        open().save(initial)
        closeStores()
        val bytes = secureFile.readBytes()
        bytes[bytes.lastIndex] = (bytes.last().toInt() xor 1).toByte()
        secureFile.writeBytes(bytes)
        val store = open()
        assertNull(store.getTokens())
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
    fun truncatedFileClearsTokensAndAllowsNewTokensToBeSaved() = runBlocking {
        open().save(initial)
        closeStores()
        secureFile.writeBytes(byteArrayOf())
        val store = open()
        assertNull(store.getTokens())
        store.save(initial)
        assertEquals(initial, store.getTokens())
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

}

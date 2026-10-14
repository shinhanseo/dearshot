package com.hanseo.dearshot.data.local.security

import android.util.Base64
import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataMigration
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferencesFileSerializer
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.crypto.tink.integration.android.AndroidKeystore
import com.hanseo.dearshot.data.local.AuthTokens
import com.hanseo.dearshot.data.local.TokenStore
import java.io.File
import java.io.IOException
import javax.crypto.BadPaddingException

/** Read-only import of the old Preferences file. Normal token writes use AeadSerializer. */
internal class LegacyTokenMigration(
    private val file: File,
    private val keyAlias: String = "dearshot_auth_tokens_v1",
    private val importLegacy: Boolean = true,
) : DataMigration<Preferences> {
    override suspend fun shouldMigrate(currentData: Preferences): Boolean =
        currentData[COMPLETED] != true || file.exists()

    override suspend fun migrate(currentData: Preferences): Preferences {
        if (currentData[COMPLETED] == true) return currentData

        val tokens = if (importLegacy && file.exists()) readLegacyTokens() else null
        return currentData.toMutablePreferences().apply {
            // Preserve any tokens already present in the destination.
            if (this[TokenStore.ACCESS_TOKEN] == null && this[TokenStore.REFRESH_TOKEN] == null) {
                tokens?.let {
                    this[TokenStore.ACCESS_TOKEN] = it.accessToken
                    this[TokenStore.REFRESH_TOKEN] = it.refreshToken
                }
            }
            this[COMPLETED] = true
        }.toPreferences()
    }

    override suspend fun cleanUp() {
        // DataStore only calls this after the encrypted destination has been committed.
        if (file.exists() && !file.delete()) {
            throw IOException("Could not remove legacy token storage")
        }
    }

    private suspend fun readLegacyTokens(): AuthTokens? {
        val preferences = try {
            file.inputStream().use { PreferencesFileSerializer.readFrom(it) }
        } catch (_: CorruptionException) {
            return null
        }
        val access = preferences[ENCRYPTED_ACCESS]
        val refresh = preferences[ENCRYPTED_REFRESH]
        return try {
            if (access != null || refresh != null) {
                if (access.isNullOrBlank() || refresh.isNullOrBlank()) return null
                if (!AndroidKeystore.hasKey(keyAlias)) return null
                val aead = AndroidKeystore.getAead(keyAlias)
                AuthTokens(
                    String(aead.decrypt(decode(access), aad("ACCESS_TOKEN")), Charsets.UTF_8),
                    String(aead.decrypt(decode(refresh), aad("REFRESH_TOKEN")), Charsets.UTF_8),
                )
            } else {
                val plainAccess = preferences[TokenStore.ACCESS_TOKEN]
                val plainRefresh = preferences[TokenStore.REFRESH_TOKEN]
                if (plainAccess.isNullOrBlank() || plainRefresh.isNullOrBlank()) null
                else AuthTokens(plainAccess, plainRefresh)
            }
        } catch (_: BadPaddingException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    private fun decode(value: String): ByteArray {
        val parts = value.split(':', limit = 3)
        require(parts.size == 3 && parts[0] == "v1")
        val iv = Base64.decode(parts[1], Base64.NO_WRAP)
        val ciphertext = Base64.decode(parts[2], Base64.NO_WRAP)
        require(iv.size == 12 && ciphertext.size > 16)
        // Tink's Keystore AEAD accepts the same IV + ciphertext + tag as the old AES/GCM format.
        return iv + ciphertext
    }

    private fun aad(field: String): ByteArray = "dearshot.auth:v1:$field".encodeToByteArray()

    internal companion object {
        val COMPLETED = booleanPreferencesKey("legacy_tokens_migrated")
        private val ENCRYPTED_ACCESS = stringPreferencesKey("encrypted_access_token")
        private val ENCRYPTED_REFRESH = stringPreferencesKey("encrypted_refresh_token")
    }
}

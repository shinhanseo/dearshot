package com.hanseo.dearshot.data.local

import android.content.Context
import androidx.datastore.core.DataMigration
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import com.hanseo.dearshot.data.local.security.TokenCipher
import com.hanseo.dearshot.data.local.security.TokenField
import com.hanseo.dearshot.data.local.security.TokenKeyMissingException
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.crypto.AEADBadTagException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

data class AuthTokens(
    val accessToken: String,
    val refreshToken: String,
) {
    init {
        require(accessToken.isNotBlank()) {
            "accessToken must not be blank"
        }
        require(refreshToken.isNotBlank()) {
            "refreshToken must not be blank"
        }
    }

    override fun toString(): String =
        "AuthTokens(accessToken=[REDACTED], refreshToken=[REDACTED])"
}

@Singleton
class TokenStore @Inject constructor(
    @ApplicationContext context: Context,
    private val tokenCipher: TokenCipher,
) {
    private val dataStore: DataStore<Preferences> =
        PreferenceDataStoreFactory.create(
            migrations = listOf(
                TokenEncryptionMigration(tokenCipher)
            ),
            produceFile = {
                context.applicationContext
                    .preferencesDataStoreFile("auth_tokens")
            },
        )

    val tokens: Flow<AuthTokens?> = dataStore.data
        .map { preferences ->
            readTokens(preferences)
        }
        .distinctUntilChanged()

    suspend fun getTokens(): AuthTokens? =
        tokens.first()

    suspend fun save(newTokens: AuthTokens) {
        val encryptedAccessToken = tokenCipher.encrypt(
            plainText = newTokens.accessToken,
            field = TokenField.ACCESS_TOKEN,
        )
        val encryptedRefreshToken = tokenCipher.encrypt(
            plainText = newTokens.refreshToken,
            field = TokenField.REFRESH_TOKEN,
        )

        dataStore.edit { preferences ->
            preferences[ENCRYPTED_ACCESS_TOKEN] =
                encryptedAccessToken
            preferences[ENCRYPTED_REFRESH_TOKEN] =
                encryptedRefreshToken

            preferences.remove(LEGACY_ACCESS_TOKEN)
            preferences.remove(LEGACY_REFRESH_TOKEN)
        }
    }

    suspend fun clear() {
        dataStore.edit { preferences ->
            preferences.remove(ENCRYPTED_ACCESS_TOKEN)
            preferences.remove(ENCRYPTED_REFRESH_TOKEN)
            preferences.remove(LEGACY_ACCESS_TOKEN)
            preferences.remove(LEGACY_REFRESH_TOKEN)
        }
    }

    suspend fun replaceIfCurrent(
        expected: AuthTokens,
        replacement: AuthTokens?,
    ): Boolean {
        var replaced = false

        dataStore.edit { preferences ->
            val currentTokens = readTokens(preferences)

            if (currentTokens != expected) {
                return@edit
            }

            if (replacement == null) {
                preferences.remove(ENCRYPTED_ACCESS_TOKEN)
                preferences.remove(ENCRYPTED_REFRESH_TOKEN)
            } else {
                val encryptedAccessToken = tokenCipher.encrypt(
                    plainText = replacement.accessToken,
                    field = TokenField.ACCESS_TOKEN,
                )
                val encryptedRefreshToken = tokenCipher.encrypt(
                    plainText = replacement.refreshToken,
                    field = TokenField.REFRESH_TOKEN,
                )

                preferences[ENCRYPTED_ACCESS_TOKEN] =
                    encryptedAccessToken
                preferences[ENCRYPTED_REFRESH_TOKEN] =
                    encryptedRefreshToken
            }

            preferences.remove(LEGACY_ACCESS_TOKEN)
            preferences.remove(LEGACY_REFRESH_TOKEN)

            replaced = true
        }

        return replaced
    }

    private suspend fun readTokens(
        preferences: Preferences,
    ): AuthTokens? {
        val encryptedAccessToken =
            preferences[ENCRYPTED_ACCESS_TOKEN]
        val encryptedRefreshToken =
            preferences[ENCRYPTED_REFRESH_TOKEN]

        if (
            encryptedAccessToken.isNullOrBlank() ||
            encryptedRefreshToken.isNullOrBlank()
        ) {
            return null
        }

        return try {
            AuthTokens(
                accessToken = tokenCipher.decrypt(
                    encryptedValue = encryptedAccessToken,
                    field = TokenField.ACCESS_TOKEN,
                ),
                refreshToken = tokenCipher.decrypt(
                    encryptedValue = encryptedRefreshToken,
                    field = TokenField.REFRESH_TOKEN,
                ),
            )
        } catch (e: TokenKeyMissingException) {
            // 키가 없어 저장된 토큰을 복원할 수 없다.
            null
        } catch (e: AEADBadTagException) {
            // 암호문이 손상되었거나 인증 검증에 실패했다.
            null
        } catch (e: IllegalArgumentException) {
            // 저장된 암호문 형식이나 토큰 값이 잘못되었다.
            null
        }
    }

    private class TokenEncryptionMigration(
        private val tokenCipher: TokenCipher,
    ) : DataMigration<Preferences> {

        override suspend fun shouldMigrate(
            currentData: Preferences,
        ): Boolean {
            return currentData[LEGACY_ACCESS_TOKEN] != null ||
                    currentData[LEGACY_REFRESH_TOKEN] != null
        }

        override suspend fun migrate(
            currentData: Preferences,
        ): Preferences {
            val preferences = currentData.toMutablePreferences()

            val legacyAccessToken =
                currentData[LEGACY_ACCESS_TOKEN]
            val legacyRefreshToken =
                currentData[LEGACY_REFRESH_TOKEN]

            val hasEncryptedData =
                currentData[ENCRYPTED_ACCESS_TOKEN] != null ||
                        currentData[ENCRYPTED_REFRESH_TOKEN] != null

            if (
                !hasEncryptedData &&
                !legacyAccessToken.isNullOrBlank() &&
                !legacyRefreshToken.isNullOrBlank()
            ) {
                val encryptedAccessToken = tokenCipher.encrypt(
                    plainText = legacyAccessToken,
                    field = TokenField.ACCESS_TOKEN,
                )
                val encryptedRefreshToken = tokenCipher.encrypt(
                    plainText = legacyRefreshToken,
                    field = TokenField.REFRESH_TOKEN,
                )

                preferences[ENCRYPTED_ACCESS_TOKEN] =
                    encryptedAccessToken
                preferences[ENCRYPTED_REFRESH_TOKEN] =
                    encryptedRefreshToken
            }

            preferences.remove(LEGACY_ACCESS_TOKEN)
            preferences.remove(LEGACY_REFRESH_TOKEN)

            return preferences
        }

        override suspend fun cleanUp() = Unit
    }

    private companion object {
        val LEGACY_ACCESS_TOKEN =
            stringPreferencesKey("access_token")

        val LEGACY_REFRESH_TOKEN =
            stringPreferencesKey("refresh_token")

        val ENCRYPTED_ACCESS_TOKEN =
            stringPreferencesKey("encrypted_access_token")

        val ENCRYPTED_REFRESH_TOKEN =
            stringPreferencesKey("encrypted_refresh_token")
    }
}
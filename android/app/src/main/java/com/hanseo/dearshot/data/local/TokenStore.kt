package com.hanseo.dearshot.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.authDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "auth_tokens",
)

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
}

class TokenStore(context: Context) {

    private val dataStore = context.applicationContext.authDataStore

    private companion object {
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
        val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
    }

    val tokens: Flow<AuthTokens?> = dataStore.data
        .map { preferences ->
            val accessToken = preferences[ACCESS_TOKEN]
            val refreshToken = preferences[REFRESH_TOKEN]

            if (accessToken.isNullOrBlank() || refreshToken.isNullOrBlank()) {
                null
            } else {
                AuthTokens(
                    accessToken = accessToken,
                    refreshToken = refreshToken,
                )
            }
        }
        .distinctUntilChanged()

    suspend fun getTokens(): AuthTokens? {
        return tokens.first()
    }

    suspend fun save(newTokens: AuthTokens) {
        dataStore.edit { preferences ->
            preferences[ACCESS_TOKEN] = newTokens.accessToken
            preferences[REFRESH_TOKEN] = newTokens.refreshToken
        }
    }

    suspend fun clear() {
        dataStore.edit { preferences ->
            preferences.remove(ACCESS_TOKEN)
            preferences.remove(REFRESH_TOKEN)
        }
    }
}
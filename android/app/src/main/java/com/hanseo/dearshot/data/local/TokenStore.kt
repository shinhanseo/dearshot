package com.hanseo.dearshot.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey
import com.hanseo.dearshot.data.local.security.EncryptedTokenDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map

data class AuthTokens(val accessToken: String, val refreshToken: String) {
    init {
        require(accessToken.isNotBlank()) { "accessToken must not be blank" }
        require(refreshToken.isNotBlank()) { "refreshToken must not be blank" }
    }

    override fun toString(): String =
        "AuthTokens(accessToken=[REDACTED], refreshToken=[REDACTED])"
}

@Singleton
class TokenStore internal constructor(
    private val loadDataStore: suspend () -> DataStore<Preferences>,
) {
    @Inject
    constructor(@ApplicationContext context: Context) :
        this(EncryptedTokenDataStore(context.applicationContext)::get)

    val tokens: Flow<AuthTokens?> = flow {
        emitAll(loadDataStore().data.map(::readTokens))
    }.distinctUntilChanged()

    suspend fun getTokens(): AuthTokens? = tokens.first()

    suspend fun save(newTokens: AuthTokens) {
        loadDataStore().updateData { writeTokens(it, newTokens) }
    }

    suspend fun clear() {
        loadDataStore().updateData { writeTokens(it, null) }
    }

    // Compare and replace in one transaction so an old refresh cannot undo logout/login.
    suspend fun replaceIfCurrent(expected: AuthTokens?, replacement: AuthTokens?): Boolean {
        var replaced = false
        loadDataStore().updateData { current ->
            if (readTokens(current) != expected) {
                current
            } else {
                replaced = true
                writeTokens(current, replacement)
            }
        }
        return replaced
    }

    private fun readTokens(preferences: Preferences): AuthTokens? {
        val access = preferences[ACCESS_TOKEN]
        val refresh = preferences[REFRESH_TOKEN]
        return if (access.isNullOrBlank() || refresh.isNullOrBlank()) null
        else AuthTokens(access, refresh)
    }

    private fun writeTokens(current: Preferences, tokens: AuthTokens?): Preferences =
        current.toMutablePreferences().apply {
            if (tokens == null) {
                remove(ACCESS_TOKEN)
                remove(REFRESH_TOKEN)
            } else {
                this[ACCESS_TOKEN] = tokens.accessToken
                this[REFRESH_TOKEN] = tokens.refreshToken
            }
        }.toPreferences()

    internal companion object {
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
        val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
    }
}

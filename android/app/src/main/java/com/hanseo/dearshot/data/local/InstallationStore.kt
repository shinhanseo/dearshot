package com.hanseo.dearshot.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.util.UUID

private val Context.installationDataStore: DataStore<Preferences>
    by preferencesDataStore(name = "installation")

class InstallationStore(context: Context) {
    private val dataStore = context.applicationContext.installationDataStore

    private companion object {
        val INSTALLATION_ID = stringPreferencesKey("installation_id")
    }

    suspend fun getOrCreatedId(): String {
        val savedPreferences = dataStore.edit { preferences ->
            val existingId = preferences[INSTALLATION_ID]

            if (existingId.isNullOrBlank()) {
                preferences[INSTALLATION_ID] = UUID.randomUUID().toString()
            }
        }

        return checkNotNull(savedPreferences[INSTALLATION_ID])
    }
}

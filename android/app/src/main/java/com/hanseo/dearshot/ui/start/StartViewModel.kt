package com.hanseo.dearshot.ui.start

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hanseo.dearshot.data.device.AppInfoProvider
import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.repository.AppConfigRepository
import com.hanseo.dearshot.data.repository.SessionRepository
import com.hanseo.dearshot.data.repository.SessionRestoreResult
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class StartViewModel @Inject constructor(
    private val appConfigRepository: AppConfigRepository,
    private val sessionRepository: SessionRepository,
    private val appInfoProvider: AppInfoProvider,
) : ViewModel() {
    private val _uiState = MutableStateFlow<StartUiState>(StartUiState.Loading)

    val uiState: StateFlow<StartUiState> = _uiState.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    fun retry() {
        load(forceRefresh = true)
    }

    private fun load(forceRefresh: Boolean = false) {
        if (loadJob?.isActive == true) return

        loadJob = viewModelScope.launch {
            _uiState.value = StartUiState.Loading

            _uiState.value = try{
                resolveStartState(forceRefresh)
            } catch (e: CancellationException) {
              throw e
            } catch (e: IOException) {
                StartUiState.Error(ApiFailure.Network)
            } catch (e : Exception) {
                StartUiState.Error(ApiFailure.Unexpected)
            }
        }
    }

    private suspend fun resolveStartState(
        forceRefresh: Boolean
    ) : StartUiState {
        val config = when (
            val result = appConfigRepository.getAppConfig(
                forceRefresh = forceRefresh
            )
        ) {
            is ApiResult.Success -> result.data

            is ApiResult.Failure -> {
                return StartUiState.Error(result.error)
            }
        }

        if (config.maintenance) {
            return StartUiState.Maintenance
        }

        if (config.forceUpdate) {
            return StartUiState.UpdateRequired(
                minimumSupportedVersion = config.minimumSupportedVersion,
                latestVersion = config.latestVersion,
            )
        }

        val provider = if (
            appInfoProvider.getLocale()
                .substringBefore('-')
                .equals("ko", ignoreCase = true)
        ) {
            SocialLoginProvider.KAKAO
        } else {
            SocialLoginProvider.GOOGLE
        }

        return when (val result = sessionRepository.restoreSession()) {
            SessionRestoreResult.Restored -> {
                StartUiState.Ready(config = config)
            }

            SessionRestoreResult.LoginRequired -> {
                StartUiState.LoginRequired(
                    provider = provider,
                    config = config,
                )
            }

            is SessionRestoreResult.Failure -> {
                StartUiState.Error(failure = result.error)
            }
        }
    }

}
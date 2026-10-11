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

class StartViewModel (
    private val appConfigRepository: AppConfigRepository, // 앱 설정을 조회한다.
    private val sessionRepository: SessionRepository, // 로그인 상태를 확인한다.
    private val appInfoProvider: AppInfoProvider // 앱의 언어를 확인한다.
) : ViewModel() {
    private val _uiState = MutableStateFlow<StartUiState>(StartUiState.Loading)

    val uiState: StateFlow<StartUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun retry() {
        load(forceRefresh = true)
    }
    private var loadJob: Job? = null

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

        val provider = if (appInfoProvider.getLocale() == "ko-KR") {
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
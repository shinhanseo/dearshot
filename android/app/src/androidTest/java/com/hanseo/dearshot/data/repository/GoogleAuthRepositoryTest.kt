package com.hanseo.dearshot.data.repository

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.hanseo.dearshot.data.device.AppInfoProvider
import com.hanseo.dearshot.data.local.AuthTokens
import com.hanseo.dearshot.data.local.InstallationStore
import com.hanseo.dearshot.data.local.TokenStore
import com.hanseo.dearshot.data.remote.ApiFailure
import com.hanseo.dearshot.data.remote.ApiResult
import com.hanseo.dearshot.data.remote.auth.*
import java.io.File
import java.util.UUID
import kotlinx.coroutines.*
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import retrofit2.Response

@RunWith(AndroidJUnit4::class)
class GoogleAuthRepositoryTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val job = SupervisorJob()
    private val file = File(context.cacheDir, "google-test-${UUID.randomUUID()}.preferences_pb")
    private val dataStore = PreferenceDataStoreFactory.create(
        scope = CoroutineScope(Dispatchers.IO + job), produceFile = { file },
    )
    private val tokens = TokenStore { dataStore }
    private var submitted: GoogleAuthRequest? = null
    private var beforeResponse: suspend () -> Unit = {}
    private var failRequest = false
    private val api = object : AuthApi {
        override suspend fun loginGuest(request: GuestAuthRequest): Response<GuestAuthResponse> = error("Unused")
        override suspend fun loginKakao(request: KakaoAuthRequest): Response<MemberAuthResponse> = error("Unused")
        override suspend fun loginGoogle(request: GoogleAuthRequest): Response<MemberAuthResponse> {
            submitted = request
            beforeResponse()
            if (failRequest) return Response.error(401, "{\"code\":\"INVALID_TOKEN\"}".toResponseBody())
            return Response.success(MemberAuthResponse(
                "Bearer", "member-access", "expiry", "member-refresh", "expiry", true,
                MemberUserResponse("user", "Name", listOf("GOOGLE"),
                    UserPreferencesResponse("en-US", "4:3", false, "v1")),
            ))
        }
    }
    private val repository = AuthRepository(api, InstallationStore(context), AppInfoProvider(context), tokens,
        object : SessionApi {
            override suspend fun getMe(authorization: String): Response<SessionProfileResponse> = error("Fresh login must not query me")
        })

    @After fun cleanup() = runBlocking {
        job.cancelAndJoin()
        file.delete()
        Unit
    }

    @Test fun newLoginSendsNonceWithoutGuestAndPersistsServerTokens() = runBlocking {
        val result = repository.loginGoogle("google-token", "fresh-nonce-123456", false)
        assertTrue(result is ApiResult.Success)
        assertEquals("fresh-nonce-123456", submitted?.nonce)
        assertNull(submitted?.guestAccessToken)
        assertEquals("ANDROID", submitted?.device?.platform)
        assertEquals(AuthTokens("member-access", "member-refresh"), tokens.getTokens())
        assertFalse(submitted.toString().contains("google-token"))
    }

    @Test fun serverRejectionPreservesExistingTokens() = runBlocking {
        val original = AuthTokens("old-access", "old-refresh")
        tokens.save(original)
        failRequest = true
        val result = repository.loginGoogle("google-token", "fresh-nonce-123456", false)
        assertTrue(result is ApiResult.Failure)
        assertEquals(original, tokens.getTokens())
    }

    @Test fun lateLoginCannotOverwriteAnotherSession() = runBlocking {
        val replacement = AuthTokens("other-access", "other-refresh")
        beforeResponse = { tokens.save(replacement) }
        val result = repository.loginGoogle("google-token", "fresh-nonce-123456", false)
        assertEquals(ApiResult.Failure(ApiFailure.SessionRecoveryRequired), result)
        assertEquals(replacement, tokens.getTokens())
    }
}

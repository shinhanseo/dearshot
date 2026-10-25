package com.hanseo.dearshot.data.device.auth

import android.app.Activity
import androidx.annotation.MainThread
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.hanseo.dearshot.BuildConfig
import java.security.SecureRandom
import java.util.Base64
import javax.inject.Inject
import kotlinx.coroutines.CancellationException

sealed interface GoogleLoginResult {
    data class Success(val idToken: String, val nonce: String) : GoogleLoginResult {
        override fun toString() = "Success(credentials=[REDACTED])"
    }
    data object Cancelled : GoogleLoginResult
    data class Failure(val cause: Throwable) : GoogleLoginResult
}

class GoogleLoginClient @Inject constructor() {
    @MainThread
    suspend fun login(activity: Activity): GoogleLoginResult {
        return try {
            require(BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()) {
                "Google web client ID is not configured"
            }
            // Each attempt gets a fresh 256-bit nonce, also verified by our backend.
            val nonce = Base64.getUrlEncoder().withoutPadding().encodeToString(
                ByteArray(32).also { SecureRandom().nextBytes(it) }
            )
            val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID)
                .setNonce(nonce)
                .build()
            val result = CredentialManager.create(activity.applicationContext).getCredential(
                context = activity,
                request = GetCredentialRequest.Builder().addCredentialOption(option).build(),
            )
            val credential = result.credential
            check(credential is CustomCredential &&
                credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL)
            val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
            check(idToken.isNotBlank())
            GoogleLoginResult.Success(idToken, nonce)
        } catch (e: GetCredentialCancellationException) {
            GoogleLoginResult.Cancelled
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            GoogleLoginResult.Failure(e)
        }
    }
}

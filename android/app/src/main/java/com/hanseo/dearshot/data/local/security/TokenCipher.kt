package com.hanseo.dearshot.data.local.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.KeyStoreException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

enum class TokenField {
    ACCESS_TOKEN,
    REFRESH_TOKEN,
}

@Singleton
class TokenCipher @Inject constructor() {

    private val keyLock = Any()

    private val keyStore: KeyStore by lazy {
        KeyStore.getInstance(KEYSTORE_PROVIDER).apply {
            load(null)
        }
    }

    suspend fun encrypt(
        plainText: String,
        field: TokenField,
    ): String = withContext(Dispatchers.IO) {
        require(plainText.isNotBlank()) {
            "Token must not be blank"
        }

        val cipher = Cipher.getInstance(TRANSFORMATION)

        // IV는 직접 지정하지 않고 암호화할 때마다 새로 생성하게 한다.
        cipher.init(
            Cipher.ENCRYPT_MODE,
            getOrCreateKey(),
        )

        cipher.updateAAD(associatedData(field))

        val encryptedBytes = cipher.doFinal(
            plainText.toByteArray(Charsets.UTF_8)
        )

        val iv = cipher.iv

        check(iv.size == IV_LENGTH_BYTES) {
            "Unexpected IV length"
        }

        val encodedIv = Base64.encodeToString(
            iv,
            Base64.NO_WRAP,
        )

        val encodedPayload = Base64.encodeToString(
            encryptedBytes,
            Base64.NO_WRAP,
        )

        "$FORMAT_VERSION:$encodedIv:$encodedPayload"
    }

    suspend fun decrypt(
        encryptedValue: String,
        field: TokenField,
    ): String = withContext(Dispatchers.IO) {
        val parts = encryptedValue.split(
            ':',
            limit = 3,
        )

        require(
            parts.size == 3 &&
                    parts[0] == FORMAT_VERSION
        ) {
            "Unsupported encrypted token format"
        }

        val iv = Base64.decode(
            parts[1],
            Base64.NO_WRAP,
        )

        val encryptedBytes = Base64.decode(
            parts[2],
            Base64.NO_WRAP,
        )

        require(iv.size == IV_LENGTH_BYTES) {
            "Invalid IV length"
        }

        require(encryptedBytes.size > TAG_LENGTH_BITS / 8) {
            "Invalid encrypted token length"
        }

        val cipher = Cipher.getInstance(TRANSFORMATION)

        cipher.init(
            Cipher.DECRYPT_MODE,
            getExistingKey(),
            GCMParameterSpec(
                TAG_LENGTH_BITS,
                iv,
            ),
        )

        cipher.updateAAD(associatedData(field))

        String(
            cipher.doFinal(encryptedBytes),
            Charsets.UTF_8,
        )
    }

    private fun getOrCreateKey(): SecretKey =
        synchronized(keyLock) {
            val existingKey = keyStore.getKey(
                KEY_ALIAS,
                null,
            )

            if (existingKey != null) {
                return@synchronized existingKey as? SecretKey
                    ?: throw KeyStoreException(
                        "Unexpected token key type"
                    )
            }

            val keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                KEYSTORE_PROVIDER,
            )

            val specification = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or
                        KeyProperties.PURPOSE_DECRYPT,
            )
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(
                    KeyProperties.ENCRYPTION_PADDING_NONE
                )
                .setRandomizedEncryptionRequired(true)
                .setUserAuthenticationRequired(false)
                .build()

            keyGenerator.init(specification)

            keyGenerator.generateKey()
        }

    private fun getExistingKey(): SecretKey =
        synchronized(keyLock) {
            val existingKey = keyStore.getKey(KEY_ALIAS, null)
                ?: throw TokenKeyMissingException()

            existingKey as? SecretKey
                ?: throw KeyStoreException(
                    "Unexpected token key type"
                )
        }

    private fun associatedData(
        field: TokenField,
    ): ByteArray {
        return "dearshot.auth:$FORMAT_VERSION:${field.name}"
            .toByteArray(Charsets.UTF_8)
    }

    private companion object {
        const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        const val KEY_ALIAS = "dearshot_auth_tokens_v1"

        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val FORMAT_VERSION = "v1"

        const val IV_LENGTH_BYTES = 12
        const val TAG_LENGTH_BITS = 128
    }
}
package co.ke.mireli.driver.data.local

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The driver's bearer token, stored encrypted at rest.
 *
 * Storage choice, and why it matters:
 *   - `EncryptedSharedPreferences` + an AES256-GCM `MasterKey` held in the
 *     Android Keystore. The key material never leaves hardware-backed storage,
 *     so a filesystem dump or a rooted-device backup yields ciphertext only.
 *   - `allowBackup=false` is set in the manifest AND `dataExtractionRules`
 *     excludes this file, so the token is not uploaded to a cloud backup or
 *     transferred to a new handset. A backup of an auth token is a way to lose
 *     control of an account.
 *
 * Deliberately NOT in Room or plain DataStore: those are readable on a rooted
 * device, and this single value is worth exactly one extra layer of defence.
 *
 * `clearOnSignOut` wipes the token but intentionally keeps nothing else, so a
 * shared handset cannot leak the previous driver's session.
 */
@Singleton
class SecureTokenStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val prefs: android.content.SharedPreferences by lazy {
        val spec = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            SECURE_FILE,
            spec,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private val _token = MutableStateFlow(readToken())

    /** Observable so the interceptor and UI react to sign-out immediately. */
    val tokenFlow: StateFlow<String?> = _token.asStateFlow()

    val currentToken: String? get() = _token.value

    fun readToken(): String? = prefs.getString(KEY_TOKEN, null)

    fun saveToken(token: String, expiresAt: String?) {
        prefs.edit().putString(KEY_TOKEN, token).putString(KEY_EXPIRES, expiresAt).apply()
        _token.value = token
    }

    /** Rotate the token on refresh without dropping the session. */
    fun updateToken(token: String) {
        prefs.edit().putString(KEY_TOKEN, token).apply()
        _token.value = token
    }

    fun clear() {
        prefs.edit().clear().apply()
        _token.value = null
    }

    val hasSession: Boolean get() = !readToken().isNullOrBlank()

    private companion object {
        const val SECURE_FILE = "mireli_secure_session"
        const val KEY_TOKEN = "driver_bearer_token"
        const val KEY_EXPIRES = "driver_token_expires_at"
    }
}
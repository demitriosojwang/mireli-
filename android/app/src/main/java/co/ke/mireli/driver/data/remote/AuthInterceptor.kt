package co.ke.mireli.driver.data.remote

import co.ke.mireli.driver.data.local.SecureTokenStore
import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Attaches the driver's bearer token and surfaces session expiry honestly.
 *
 * Two behaviours worth naming:
 *
 *  1. A 401 is NOT retried and NOT retried-with-refresh in the MVP. There is no
 *     refresh-token endpoint yet, and inventing one silently here would hide an
 *     unfinished auth story behind an app that appears to "just work". Instead
 *     the 401 propagates and the UI sends the driver to sign in.
 *
 *  2. A network failure is distinguishable from an HTTP failure. IOException →
 *     the caller shows the offline path and keeps the command queued. HTTP 4xx
 *     → a real rejection the driver must see. Collapsing the two is how a
 *     rejected boarding becomes a silent offline queue, and the passenger is
 *     then boarded in reality but not in the system.
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenStore: SecureTokenStore,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()

        // The auth endpoint mints the token, so it must never carry a stale one.
        val isAuthEndpoint = request.url.encodedPath.endsWith("/api/driver/auth")
        val token = tokenStore.currentToken

        val builder = request.newBuilder()
            .header("Accept", "application/json")
        if (!isAuthEndpoint && !token.isNullOrBlank()) {
            builder.header("Authorization", "Bearer $token")
        }

        return try {
            chain.proceed(builder.build())
        } catch (io: IOException) {
            // Propagate as-is. The repository distinguishes this from an HTTP
            // rejection and routes it to the offline queue.
            throw io
        }
    }
}

/** Marker for "the session is gone and the driver must sign in again". */
class SessionExpiredException(cause: Throwable? = null) :
    Exception("Driver session expired", cause)

/** Marker for "no connectivity" — distinct from a server rejection. */
class OfflineException(cause: Throwable? = null) :
    Exception("No network connection", cause)
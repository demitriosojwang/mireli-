package co.ke.mireli.driver.data.remote

import co.ke.mireli.driver.data.remote.dto.ApiErrorDto
import co.ke.mireli.driver.data.remote.dto.AssignmentDecisionRequest
import co.ke.mireli.driver.data.remote.dto.AssignmentDecisionResponse
import co.ke.mireli.driver.data.remote.dto.AssignmentsResponse
import co.ke.mireli.driver.data.remote.dto.AuthRequestDto
import co.ke.mireli.driver.data.remote.dto.AuthResponseDto
import co.ke.mireli.driver.data.remote.dto.AvailabilityRequest
import co.ke.mireli.driver.data.remote.dto.AvailabilityResponse
import co.ke.mireli.driver.data.remote.dto.BoardingRequest
import co.ke.mireli.driver.data.remote.dto.BoardingResponse
import co.ke.mireli.driver.data.remote.dto.CharterRequestResponse
import co.ke.mireli.driver.data.remote.dto.CharterSubscriptionResponse
import co.ke.mireli.driver.data.remote.dto.DriverMeResponse
import co.ke.mireli.driver.data.remote.dto.EarningsResponse
import co.ke.mireli.driver.data.remote.dto.ManifestResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/**
 * The shared Mi-Reli driver API.
 *
 * Every method returns `Response<T>` rather than a bare `T` so the data layer
 * can read the backend's stable error `code` (STALE_ASSIGNMENT, NOT_ELIGIBLE,
 * ALREADY_FULLY_BOARDED, MISSING_ACTION_ID …) instead of collapsing every
 * failure into "something went wrong". Those codes drive specific, honest UI:
 * a stale assignment needs a refresh, a document problem needs a document
 * screen, and a cancelled booking needs a phone call to dispatch.
 *
 * All routes are authenticated except `auth`, which mints the token. The
 * interceptor attaches the bearer header and turns a 401 into a clean
 * sign-out signal rather than a generic failure.
 */
interface MireliDriverApi {

    @POST("api/driver/auth")
    suspend fun auth(@Body body: AuthRequestDto): Response<AuthResponseDto>

    @GET("api/driver/me")
    suspend fun me(): Response<DriverMeResponse>

    @POST("api/driver/me")
    suspend fun setAvailability(@Body body: AvailabilityRequest): Response<AvailabilityResponse>

    @GET("api/driver/assignments")
    suspend fun assignments(): Response<AssignmentsResponse>

    @POST("api/driver/assignments")
    suspend fun decideAssignment(
        @Body body: AssignmentDecisionRequest,
    ): Response<AssignmentDecisionResponse>

    @GET("api/driver/assignments/{tripId}/manifest")
    suspend fun manifest(@Path("tripId") tripId: String): Response<ManifestResponse>

    @POST("api/driver/assignments/{tripId}/boardings")
    suspend fun recordBoarding(
        @Path("tripId") tripId: String,
        @Body body: BoardingRequest,
    ): Response<BoardingResponse>

    @GET("api/driver/earnings")
    suspend fun earnings(): Response<EarningsResponse>

    @GET("api/driver/charter-subscription")
    suspend fun charterSubscription(): Response<CharterSubscriptionResponse>

    @POST("api/driver/charter-subscription")
    suspend fun requestCharter(): Response<CharterRequestResponse>

    @POST("api/driver/auth")
    suspend fun logout(@Body body: AuthRequestDto): Response<AuthResponseDto>

    companion object {
        /**
         * Parse the backend's error envelope from a failed response.
         *
         * `errorBody()` is a one-shot stream, so the string is read exactly once
         * and decoded from it. Returns null for a non-JSON or empty body, which
         * the caller must treat as "unknown failure" rather than assuming a code.
         */
        fun errorOf(response: Response<*>): ApiErrorDto? {
            val raw = try {
                response.errorBody()?.string()
            } catch (_: Exception) {
                null
            } ?: return null
            if (raw.isBlank()) return null
            return runCatching {
                ApiErrorJson.decodeFromString(ApiErrorDto.serializer(), raw)
            }.getOrNull()
        }

        private val ApiErrorJson = kotlinx.serialization.json.Json {
            ignoreUnknownKeys = true
        }
    }
}
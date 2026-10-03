package co.ke.mireli.driver.data.repository

import co.ke.mireli.driver.data.local.PendingActionDao
import co.ke.mireli.driver.data.local.PendingActionEntity
import co.ke.mireli.driver.data.remote.MireliDriverApi
import co.ke.mireli.driver.data.remote.SessionExpiredException
import co.ke.mireli.driver.data.remote.dto.BoardingRequest
import co.ke.mireli.driver.data.remote.dto.BoardingSummaryDto
import java.io.IOException
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The single place where a driver action becomes either a confirmed record or a
 * queued one. Everything above this layer deals in outcomes, never in HTTP.
 *
 * The critical contract: [recordBoarding] NEVER reports a success it cannot
 * justify. Its three outcomes are deliberately distinct:
 *
 *   Confirmed — the server accepted and counted it.
 *   Queued    — no connectivity, so it is persisted for later. The UI must say
 *               "waiting to sync", NOT "boarded".
 *   Failed    — the server actively rejected it (wrong trip, cancelled booking,
 *               already full). The driver must know, because a passenger is
 *               physically standing there.
 *
 * Collapsing "queued" into "confirmed" is the failure this file exists to
 * prevent: a vehicle departs with passengers the system believes did not board,
 * which triggers bogus no-show refunds and wrongly penalises the driver.
 */
@Singleton
class BoardingRepository @Inject constructor(
    private val api: MireliDriverApi,
    private val pendingDao: PendingActionDao,
) {

    val pendingCount = pendingDao.observePendingCount()

    /**
     * @param clientActionId generated ONCE by the caller and reused on every
     *        retry. Never regenerate it inside this function — the server's
     *        uniqueness constraint is what makes a replay safe.
     */
    suspend fun recordBoarding(
        tripId: String,
        bookingId: String,
        count: Int,
        method: String,
        clientActionId: String,
        deviceId: String,
    ): BoardingOutcome {
        val body = BoardingRequest(
            bookingId = bookingId,
            count = count,
            method = method,
            clientActionId = clientActionId,
            deviceId = deviceId,
            observedAt = Instant.now().toString(),
        )

        return try {
            val response = api.recordBoarding(tripId, body)
            when {
                response.isSuccessful -> {
                    val dto = response.body()
                    // duplicate=true means the server already had this exact
                    // command. That still satisfies the driver's intent — the
                    // passenger is boarded — so it is reported as confirmed.
                    BoardingOutcome.Confirmed(
                        boardedCount = dto?.boardedCount ?: count,
                        summary = dto?.summary,
                        wasDuplicate = dto?.duplicate == true,
                        partial = dto?.partial == true,
                    )
                }

                response.code() == 401 -> throw SessionExpiredException()

                else -> {
                    val err = MireliDriverApi.errorOf(response)
                    // A rejected boarding is terminal for this command id. Do
                    // NOT queue it: retrying a refusal the server already gave
                    // would loop forever and hide the problem from the driver.
                    BoardingOutcome.Failed(
                        message = err?.error ?: "The server rejected this boarding",
                        code = err?.code,
                    )
                }
            }
        } catch (io: IOException) {
            // No connectivity. Persist BEFORE returning, so the action survives
            // process death, then report it as pending — honestly.
            enqueue(tripId, bookingId, count, method, clientActionId, deviceId)
            BoardingOutcome.Queued
        }
    }

    private suspend fun enqueue(
        tripId: String,
        bookingId: String?,
        count: Int,
        method: String,
        clientActionId: String,
        deviceId: String,
    ) {
        pendingDao.insert(
            PendingActionEntity(
                clientActionId = clientActionId,
                tripId = tripId,
                bookingId = bookingId,
                type = TYPE_BOARDING,
                count = count,
                method = method,
                deviceId = deviceId,
                observedAt = Instant.now().toString(),
                createdAt = System.currentTimeMillis(),
            )
        )
    }
}

/** The three honest outcomes of a boarding action. */
sealed interface BoardingOutcome {
    data class Confirmed(
        val boardedCount: Int,
        val summary: BoardingSummaryDto?,
        val wasDuplicate: Boolean,
        val partial: Boolean,
    ) : BoardingOutcome

    /** Persisted locally; the UI must show "waiting to sync", not "boarded". */
    data object Queued : BoardingOutcome

    data class Failed(val message: String, val code: String?) : BoardingOutcome
}
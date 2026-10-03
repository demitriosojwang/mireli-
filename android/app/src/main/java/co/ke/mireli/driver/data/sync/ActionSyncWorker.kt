package co.ke.mireli.driver.data.repository

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import co.ke.mireli.driver.data.local.PendingActionDao
import co.ke.mireli.driver.data.local.PendingActionEntity
import co.ke.mireli.driver.data.remote.MireliDriverApi
import co.ke.mireli.driver.data.remote.SessionExpiredException
import co.ke.mireli.driver.data.remote.dto.BoardingRequest
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.IOException
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Replays queued driver actions once connectivity returns.
 *
 * Scheduled with `NetworkType.CONNECTED` so the OS wakes us the moment signal
 * returns, rather than the driver having to keep the app open. Also triggered
 * directly on app foreground — a driver who walks back into coverage with the
 * app open should not wait for the periodic window.
 *
 * Deliberately NOT WorkManager's job to do continuous GPS. WorkManager is
 * deferred, retryable work; trip tracking is a foreground service. Using
 * WorkManager for tracking would be both unreliable and a policy problem.
 */
@HiltWorker
class ActionSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val api: MireliDriverApi,
    private val dao: PendingActionDao,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val due = dao.dueForSync(System.currentTimeMillis())
        if (due.isEmpty()) return Result.success()

        var synced = 0
        var terminalFailures = 0

        for (action in due) {
            dao.markAttempt(action.clientActionId, STATE_SYNCING, null)
            try {
                val response = api.recordBoarding(
                    action.tripId,
                    BoardingRequest(
                        bookingId = action.bookingId.orEmpty(),
                        count = action.count,
                        method = action.method,
                        // The ORIGINAL id. This is the whole point: a replay the
                        // server already saw resolves as a duplicate instead of
                        // boarding the same passenger twice.
                        clientActionId = action.clientActionId,
                        deviceId = action.deviceId,
                        observedAt = action.observedAt,
                    ),
                )
                when {
                    response.isSuccessful -> {
                        dao.markDone(action.clientActionId)
                        synced++
                    }
                    response.code() in 400..499 -> {
                        // A genuine business rejection (cancelled booking, wrong
                        // trip). Stop retrying — keep the row so dispatch and the
                        // driver can see it happened.
                        dao.markAttempt(
                            action.clientActionId,
                            STATE_FAILED,
                            MireliDriverApi.errorOf(response)?.error ?: "Rejected by server",
                        )
                        terminalFailures++
                    }
                    else -> return Result.retry()
                }
            } catch (_: SessionExpiredException) {
                dao.markAttempt(action.clientActionId, STATE_FAILED, "Session expired")
                terminalFailures++
                return Result.failure()
            } catch (_: IOException) {
                return Result.retry()
            }
        }
        return Result.success()
    }

    companion object {
        const val WORK_NAME = "mireli_action_sync"
        const val TYPE_BOARDING = "boarding"
        const val STATE_SYNCING = "syncing"
        const val STATE_FAILED = "failed"

        /** Periodic safety net; foreground also triggers this immediately. */
        fun schedulePeriodic(context: Context) {
            val request = PeriodicWorkRequestBuilder<ActionSyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }
    }
}
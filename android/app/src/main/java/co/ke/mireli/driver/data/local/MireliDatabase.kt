package co.ke.mireli.driver.data.local

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

/**
 * Durable queue of driver actions taken without connectivity.
 *
 * This is the single most important piece of offline behaviour in the app.
 * A driver at the Mombasa terminus boarding passengers is exactly where signal
 * fails, and that is precisely when boarding must be recorded. Losing a tap
 * because a request timed out would mean the passenger is on the vehicle but
 * invisible to the system — which produces a wrong no-show, a wrong refund, or
 * revenue attributed to the wrong driver.
 *
 * Design rules:
 *   - `clientActionId` is generated BEFORE the network call and is the PRIMARY
 *     KEY. Retrying replays the same id, so the server's uniqueness constraint
 *     makes the retry safe. This is why the app never mints a new id on retry.
 *   - The row is persisted BEFORE any request is attempted, so a process death
 *     mid-request still leaves a queued command.
 *   - `state` distinguishes pending / syncing / failed so the UI can honestly
 *     show "waiting to sync" versus "could not be sent" — never a fake success.
 */
@Entity(tableName = "pending_actions")
data class PendingActionEntity(
    @PrimaryKey val clientActionId: String,
    val tripId: String,
    val bookingId: String?,
    /** boarding | acknowledge | decline | trip_action */
    val type: String,
    val count: Int = 1,
    val method: String = "manual",
    val deviceId: String?,
    /** When the driver performed the action — evidence, not authority. */
    val observedAt: String,
    val createdAt: Long,
    /** pending | syncing | failed | done */
    val state: String = "pending",
    val attempts: Int = 0,
    val lastError: String? = null,
    val nextAttemptAt: Long = 0,
)

@Dao
interface PendingActionDao {

    @Insert(onConflict = androidx.room.OnConflictStrategy.IGNORE)
    suspend fun insert(action: PendingActionEntity)

    /** Oldest-first so boarding actions replay in the order they happened. */
    @Query("SELECT * FROM pending_actions WHERE state IN ('pending','syncing') AND nextAttemptAt <= :now ORDER BY createdAt ASC LIMIT :limit")
    suspend fun dueForSync(now: Long, limit: Int = 50): List<PendingActionEntity>

    @Query("SELECT COUNT(*) FROM pending_actions WHERE state IN ('pending','syncing')")
    fun observePendingCount(): Flow<Int>

    @Query("UPDATE pending_actions SET state = :state, attempts = attempts + 1, lastError = :error WHERE clientActionId = :id")
    suspend fun markAttempt(id: String, state: String, error: String?)

    @Query("UPDATE pending_actions SET state = 'done' WHERE clientActionId = :id")
    suspend fun markDone(id: String)

    /** Exponential backoff so a permanently failing action cannot hammer the API. */
    @Query("UPDATE pending_actions SET nextAttemptAt = :nextAt WHERE clientActionId = :id")
    suspend fun scheduleRetry(id: String, nextAt: Long)

    @Query("DELETE FROM pending_actions WHERE clientActionId = :id")
    suspend fun delete(id: String)

    @Query("SELECT * FROM pending_actions WHERE tripId = :tripId ORDER BY createdAt ASC")
    suspend fun forTrip(tripId: String): List<PendingActionEntity>
}

@Database(
    entities = [PendingActionEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class MireliDatabase : RoomDatabase() {
    abstract fun pendingActionDao(): PendingActionDao

    companion object {
        const val NAME = "mireli_driver.db"
    }
}
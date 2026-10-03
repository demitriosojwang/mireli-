package co.ke.mireli.driver.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * Assignment, manifest, boarding, earnings and charter wire models.
 *
 * Note `assignmentState` is a STRING union, not a boolean. "Pending",
 * "accepted", "declined", "withdrawn" and "expired" are five different real
 * situations, and collapsing them into accepted:true/false is how a driver ends
 * up driving a trip dispatch already pulled back from them.
 */

@Serializable
data class TrainRefDto(
    val name: String = "",
    val direction: String? = null,
    val mtmTime: String? = null,
    val ntmTime: String? = null,
    val eventKind: String? = null,
)

@Serializable
data class AssignmentDto(
    val tripId: String,
    val assignmentState: String = "pending",
    val assignmentVersion: Int = 0,
    val train: TrainRefDto? = null,
    val routeName: String = "",
    val direction: String = "",
    val serviceType: String = "shared",
    val isCharter: Boolean = false,
    val charterName: String? = null,
    val departureAt: String? = null,
    val reportAt: String? = null,
    val tripStatus: String? = null,
    val expectedSeats: Int = 0,
    val bookings: Int = 0,
    val capacity: Int = 0,
    val notes: String? = null,
    val acknowledgeDeadline: String? = null,
    val minutesUntilReport: Int? = null,
    val isImminent: Boolean = false,
)

@Serializable
data class AssignmentsResponse(
    val assignments: List<AssignmentDto> = emptyList(),
    val actionable: AssignmentDto? = null,
    val eligibility: EligibilityDto = EligibilityDto(),
    val commissionRatePercent: Int = 0,
    val serverTime: String? = null,
)

@Serializable
data class AssignmentDecisionRequest(
    val tripId: String,
    val action: String,
    val reason: String? = null,
    /** Optimistic-concurrency token; the server rejects a stale decision. */
    val expectedVersion: Int? = null,
)

@Serializable
data class AssignmentDecisionResponse(
    val ok: Boolean = false,
    val assignmentState: String? = null,
    val currentVersion: Int? = null,
    val note: String? = null,
    val error: String? = null,
    val code: String? = null,
)

@Serializable
data class ManifestPartyDto(
    val bookingId: String,
    val code: String = "",
    val passengerName: String = "",
    val passengerPhone: String? = null,
    val seats: Int = 1,
    val boardedCount: Int = 0,
    /** not_boarded | partial | boarded */
    val boardingState: String = "not_boarded",
    val boardedAt: String? = null,
    val stageName: String? = null,
    val homePickup: Boolean = false,
    val homeAddress: String? = null,
    val homeSurcharge: Int = 0,
    val isCharter: Boolean = false,
    val status: String? = null,
    val note: String? = null,
)

@Serializable
data class ManifestSummaryDto(
    val bookings: Int = 0,
    val expectedSeats: Int = 0,
    val boardedSeats: Int = 0,
    val remaining: Int = 0,
    val isCharter: Boolean = false,
)

@Serializable
data class StopDto(
    val id: String,
    val name: String = "",
    val order: Int = 0,
    val lat: Double? = null,
    val lng: Double? = null,
)

@Serializable
data class VehicleDto(
    val plate: String = "",
    val cabType: String = "",
    val capacity: Int = 0,
)

@Serializable
data class ManifestResponse(
    val tripId: String,
    val assignmentState: String = "pending",
    val routeName: String = "",
    val direction: String = "",
    val serviceType: String = "shared",
    val isCharter: Boolean = false,
    val charterName: String? = null,
    val departureAt: String? = null,
    val reportAt: String? = null,
    val tripStatus: String? = null,
    val vehicle: VehicleDto = VehicleDto(),
    val train: TrainRefDto? = null,
    val stops: List<StopDto> = emptyList(),
    val pointsLabel: String = "pickup",
    val summary: ManifestSummaryDto = ManifestSummaryDto(),
    val parties: List<ManifestPartyDto> = emptyList(),
    val notes: String? = null,
    val version: Int = 0,
    val serverTime: String? = null,
    /** After this instant the app must purge its cached copy of this manifest. */
    val cacheExpiresAt: String? = null,
)

@Serializable
data class BoardingRequest(
    val bookingId: String,
    val count: Int = 1,
    /** qr | code | manual | dispatch */
    val method: String = "manual",
    /**
     * Stable, generated on the device BEFORE the request is attempted and reused
     * on every retry. The server enforces uniqueness, so a tap-twice or a retry
     * after a real success cannot double-count a passenger.
     */
    val clientActionId: String,
    val deviceId: String? = null,
    /** When the driver observed it, as evidence — server time stays authoritative. */
    val observedAt: String? = null,
)

@Serializable
data class BoardingSummaryDto(
    val boardedSeats: Int = 0,
    val expectedSeats: Int = 0,
    val remaining: Int = 0,
)

@Serializable
data class BoardingResponse(
    val ok: Boolean = false,
    /** True when this exact command was already processed — do not re-board. */
    val duplicate: Boolean = false,
    val boardedCount: Int = 0,
    val boardedAt: String? = null,
    val summary: BoardingSummaryDto? = null,
    val partial: Boolean = false,
    val message: String? = null,
    val error: String? = null,
    val code: String? = null,
)
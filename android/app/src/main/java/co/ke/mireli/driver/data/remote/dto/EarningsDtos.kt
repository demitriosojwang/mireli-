package co.ke.mireli.driver.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * Earnings and charter wire models.
 *
 * The important convention here: money is split into named components rather
 * than a single `net`. A driver who sees "KSh 4,200" with no explanation will
 * assume they were shortchanged; showing gross, the commission rate, and the
 * pass-through surcharge makes the same number self-explaining and turns most
 * payout disputes into a conversation rather than a complaint.
 */

@Serializable
data class EarningsTotalsDto(
    val gross: Int = 0,
    val commission: Int = 0,
    val surcharge: Int = 0,
    val net: Int = 0,
    val trips: Int = 0,
)

@Serializable
data class EarningsCountDto(
    val amount: Int = 0,
    val count: Int = 0,
)

@Serializable
data class RidesSummaryDto(
    val total: Int = 0,
    val shared: Int = 0,
    val chartered: Int = 0,
    val passengerSeats: Int = 0,
)

@Serializable
data class SettlementInfoDto(
    val mode: String = "weekly",
    val note: String = "",
)

@Serializable
data class EarningsLineDto(
    val id: String,
    val routeName: String? = null,
    val serviceType: String = "shared",
    val gross: Int = 0,
    val commission: Int = 0,
    val homeSurcharge: Int = 0,
    val net: Int = 0,
    /** queued | completed | failed */
    val status: String = "queued",
    val result: String? = null,
    val failureReason: String? = null,
    val initiatedAt: String? = null,
    val completedAt: String? = null,
)

@Serializable
data class EarningsResponse(
    val lifetime: EarningsTotalsDto = EarningsTotalsDto(),
    val thisWeek: EarningsTotalsDto = EarningsTotalsDto(),
    val shared: EarningsTotalsDto = EarningsTotalsDto(),
    val chartered: EarningsTotalsDto = EarningsTotalsDto(),
    val queued: EarningsCountDto = EarningsCountDto(),
    val paid: EarningsCountDto = EarningsCountDto(),
    val failed: EarningsCountDto = EarningsCountDto(),
    val rides: RidesSummaryDto = RidesSummaryDto(),
    val settlement: SettlementInfoDto = SettlementInfoDto(),
    val lines: List<EarningsLineDto> = emptyList(),
    val commissionRatePercent: Int = 15,
    val breakdownNote: String = "",
    val payoutMode: String = "weekly",
    val payoutDay: Int = 5,
    val serverTime: String? = null,
)

@Serializable
data class CharterPlanDto(
    val name: String = "",
    val description: String = "",
    val indicativeMonthlyKSh: Int = 0,
    val benefits: List<String> = emptyList(),
)

@Serializable
data class CharterPerformanceDto(
    val charteredTrips: Int = 0,
    val sharedTrips: Int = 0,
    val totalTrips: Int = 0,
)

@Serializable
data class CharterSubscriptionResponse(
    val subscription: SubscriptionStateDto = SubscriptionStateDto(),
    val plan: CharterPlanDto = CharterPlanDto(),
    val performance: CharterPerformanceDto = CharterPerformanceDto(),
    val commissionRatePercent: Int = 15,
    val purchaseNote: String = "",
    val serverTime: String? = null,
)

@Serializable
data class CharterRequestResponse(
    val ok: Boolean = false,
    val alreadyActive: Boolean = false,
    val alreadyRequested: Boolean = false,
    val message: String = "",
    val error: String? = null,
)

/** Generic error envelope the backend returns for 4xx responses. */
@Serializable
data class ApiErrorDto(
    val error: String? = null,
    val code: String? = null,
    val cooldownSeconds: Int? = null,
    val assignmentState: String? = null,
    val currentVersion: Int? = null,
)
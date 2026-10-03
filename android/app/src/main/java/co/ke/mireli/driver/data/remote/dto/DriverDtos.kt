package co.ke.mireli.driver.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Wire models for the shared Mi-Reli driver API.
 *
 * These mirror the JSON returned by the Next.js backend in `msafiri`
 * (`/api/driver/*`). Every field the backend sends is nullable or defaulted
 * here on purpose: the app must not crash because a new server field is absent
 * or a nullable value became null. A missing value renders as "—" or triggers a
 * refetch — it never throws.
 *
 * Money is Int in KSh (matching the backend's minor-unit integer arithmetic).
 * Never a Double: floating-point shilling is how a statement stops balancing.
 */

@Serializable
data class AuthRequestDto(
    val step: String,
    val phone: String? = null,
    val code: String? = null,
    val deviceId: String? = null,
    val deviceLabel: String? = null,
    val appVersion: String? = null,
)

@Serializable
data class AuthResponseDto(
    val ok: Boolean = false,
    val token: String? = null,
    val expiresAt: String? = null,
    val driver: DriverBriefDto? = null,
    val error: String? = null,
    val cooldownSeconds: Int? = null,
)

@Serializable
data class DriverBriefDto(
    val id: String,
    val name: String = "",
    val plate: String = "",
)

@Serializable
data class DriverProfileDto(
    val id: String,
    val name: String = "",
    val phone: String = "",
    val plate: String = "",
    val cabType: String = "",
    val capacity: Int = 0,
    val status: String = "active",
    val statusReason: String? = null,
    val licenceNumber: String? = null,
    val licenceClass: String? = null,
    val licenceExpiry: String? = null,
    val available: Boolean = false,
    val availableSince: String? = null,
    val nationalId: String? = null,
)

@Serializable
data class EligibilityDto(
    val eligible: Boolean = false,
    val reasons: List<String> = emptyList(),
    val warnings: List<String> = emptyList(),
)

@Serializable
data class RidesCountersDto(
    val tripsCompleted: Int = 0,
    val sharedTripsCompleted: Int = 0,
    val charterTripsCompleted: Int = 0,
    val passengerSeatsCarried: Int = 0,
)

@Serializable
data class DriverDocumentDto(
    val id: String,
    val type: String = "",
    val displayName: String? = null,
    val status: String = "pending",
    val rejectReason: String? = null,
    val expiresAt: String? = null,
    val reviewedAt: String? = null,
)

@Serializable
data class SubscriptionStateDto(
    val active: Boolean = false,
    val expiresAt: String? = null,
    val current: CharterSubscriptionDto? = null,
    val history: List<CharterSubscriptionDto> = emptyList(),
)

@Serializable
data class CharterSubscriptionDto(
    val id: String,
    val plan: String = "",
    val status: String = "pending",
    val amount: Int = 0,
    val termsVersion: String = "v1",
    val startsAt: String? = null,
    val endsAt: String? = null,
)

@Serializable
data class DriverNotificationDto(
    val id: String,
    val type: String = "",
    val title: String = "",
    val body: String = "",
    val severity: String = "info",
    val tripId: String? = null,
    val createdAt: String? = null,
    val read: Boolean = false,
)

@Serializable
data class DriverMeResponse(
    val driver: DriverProfileDto,
    val eligibility: EligibilityDto = EligibilityDto(),
    val rides: RidesCountersDto? = null,
    val documents: List<DriverDocumentDto> = emptyList(),
    val subscription: SubscriptionStateDto = SubscriptionStateDto(),
    val notifications: List<DriverNotificationDto> = emptyList(),
)

@Serializable
data class AvailabilityRequest(val available: Boolean)

@Serializable
data class AvailabilityResponse(
    val ok: Boolean = false,
    val available: Boolean = false,
    val assignmentHorizonHours: Int = 0,
    val commissionRatePercent: Int = 0,
    val error: String? = null,
)
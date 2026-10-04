/**
 * Driver-facing projections: eligibility, manifests and earnings.
 *
 * The single most important rule in this file: a driver's manifest is built from
 * `trip.driverId === driver.id`, never from a client-supplied trip id. If the
 * app sends someone else's trip, the lookup simply returns nothing. That is what
 * stops a driver reading another driver's passengers by editing an identifier.
 */
import { db } from "@/lib/db";
import { evaluateEligibility } from "@/lib/driver-onboarding";

/** Booking states that occupy a seat and belong on a working manifest. */
const LIVE_BOOKING_STATUSES = ["confirmed", "boarded", "completed"] as const;

/** How far ahead a driver is shown work. Beyond this, dispatch owns it. */
export const ASSIGNMENT_HORIZON_MS = 36 * 60 * 60 * 1000;

/**
 * May this driver be given NEW work right now?
 *
 * Delegates to the onboarding engine, which is the single definition of the
 * requirement set. This function stays as the one call site every endpoint uses,
 * so the rule cannot diverge between routes.
 *
 * Note what it deliberately does NOT do: it does not cancel an in-progress trip
 * when a document lapses mid-journey. Yanking a vehicle carrying passengers to
 * the terminus would be dangerous and unlawful. Expiry blocks new assignment and
 * surfaces a warning; dispatch handles the running trip.
 */
export async function checkEligibility(driverId: string): Promise<{
  eligible: boolean;
  reasons: string[];
  warnings: string[];
}> {
  const driver = await db.driver.findUnique({
    where: { id: driverId },
    include: { onboarding: { include: { checks: true } } },
  });
  if (!driver) return { eligible: false, reasons: ["Driver account not found"], warnings: [] };

  if (driver.status === "suspended") {
    return {
      eligible: false,
      reasons: [driver.statusReason || "Your account is suspended. Contact dispatch."],
      warnings: [],
    };
  }
  if (driver.status === "inactive") {
    return {
      eligible: false,
      reasons: ["Your account is not active. Contact dispatch."],
      warnings: [],
    };
  }

  // No onboarding record means the driver never applied. They may still sign in
  // and see the checklist, but they cannot be handed work.
  if (!driver.onboarding) {
    return {
      eligible: false,
      reasons: ["Complete your driver registration before taking trips."],
      warnings: [],
    };
  }

  const result = evaluateEligibility({
    capacity: driver.capacity,
    onboardingStatus: driver.onboarding.status,
    policyVersionAccepted: driver.onboarding.policyVersionAccepted,
    checks: driver.onboarding.checks.map((c) => ({
      docType: c.docType,
      requiredFor: c.requiredFor,
      state: c.state,
      validUntil: c.validUntil,
      note: c.note,
    })),
  });

  return {
    eligible: result.clearedToDrive,
    reasons: result.blockers,
    warnings: [...result.advisories, ...licenceWarnings(driver)],
  };
}

/**
 * The passenger manifest for one trip, scoped to the assigned driver.
 *
 * Data minimisation, applied here rather than trusted to the UI:
 *   - Only the fields a driver genuinely needs to run the trip.
 *   - No fare amounts, no payment state, no ledger information. Earnings are a
 *     separate, purpose-built view; the manifest never doubles as a receipt.
 *   - A passenger's ID number and email are NOT included. A driver collecting
 *     strangers does not need them, and the driver is a higher-risk holder of
 *     that data than the dispatch system.
 */
export async function buildManifest(tripId: string) {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    include: {
      route: { include: { stages: { orderBy: { order: "asc" } } } },
      train: true,
      bookings: {
        where: { status: { in: [...LIVE_BOOKING_STATUSES] } },
        orderBy: { createdAt: "asc" },
      },
      boardings: true,
    },
  });
  if (!trip) return null;

  // Boarded counts are SUMMED from the records rather than trusted from the
  // booking row, so a double-counted scan cannot inflate the manifest.
  const boardedByBooking = new Map<string, number>();
  for (const b of trip.boardings) {
    boardedByBooking.set(b.bookingId, (boardedByBooking.get(b.bookingId) ?? 0) + b.count);
  }

  const parties = trip.bookings.map((b) => {
    const boarded = boardedByBooking.get(b.id) ?? 0;
    const expected = b.seats;
    return {
      bookingId: b.id,
      code: b.code,
      passengerName: b.passengerName || "Guest",
      // Contact is needed to find the person; it is deliberately absent from
      // push notifications and from any cached manifest outside the live window.
      passengerPhone: b.passengerPhone,
      seats: expected,
      boardedCount: boarded,
      boardingState: boarded === 0 ? "not_boarded" : boarded >= expected ? "boarded" : "partial",
      stageName: b.stageName,
      homePickup: b.homePickup,
      // Door-to-door addresses are operationally necessary but sensitive; they
      // are surfaced only to the driver actually running the trip.
      homeAddress: b.homePickup ? b.homeAddress : null,
      homeSurcharge: b.homeSurcharge,
      isCharter: b.isCharter,
      status: b.status,
    };
  });

  const expectedSeats = parties.reduce((s, p) => s + p.seats, 0);
  const boardedSeats = parties.reduce((s, p) => s + p.boardedCount, 0);

  return {
    trip,
    parties,
    summary: {
      bookings: parties.length,
      expectedSeats,
/**
 * The assignment lifecycle as the DRIVER understands it - deliberately distinct
 * from the ops `Trip.status`, which describes the service, not the agreement.
 */
export function deriveAssignmentState(trip: {
  status: string;
  acknowledgedAt: Date | null;
  declinedAt: Date | null;
  withdrawnAt: Date | null;
  assignmentDeadline: Date | null;
}): "pending" | "accepted" | "declined" | "withdrawn" | "expired" {
  if (trip.withdrawnAt) return "withdrawn";
  if (trip.declinedAt) return "declined";
  if (trip.acknowledgedAt) return "accepted";
  if (trip.assignmentDeadline && trip.assignmentDeadline < new Date()) return "expired";
  if (["cancelled", "completed"].includes(trip.status)) return "expired";
  return "pending";
}

/** Departures the driver should see: assigned to them, inside the horizon. */
export async function listAssignedTrips(driverId: string) {
  const now = new Date();
  const horizon = new Date(now.getTime() + ASSIGNMENT_HORIZON_MS);
  return db.trip.findMany({
    where: {
      driverId,
      departureAt: { gte: new Date(now.getTime() - 12 * 60 * 60 * 1000), lte: horizon },
    },
    orderBy: { departureAt: "asc" },
    include: {
      route: { include: { stages: { orderBy: { order: "asc" } } } },
      train: true,
      bookings: { where: { status: { in: [...LIVE_BOOKING_STATUSES] } } },
    },
  });
}

/**
 * Projected pay for a single trip, shown BEFORE the driver accepts it.
 *
 * This is a STATEMENT of what the trip is worth, not a guarantee. It is derived
 * from the same booking rows finance will settle, so the app can never disagree
 * with what is actually paid - but a cancellation or a shortened trip still
 * changes the final figure. The UI must label it PROJECTED.
 *
 * Note the surcharge rule: door-to-door surcharges pass through to the driver in
 * full and are excluded from the commission base. That matches the settlement
 * arithmetic on the passenger side exactly.
 */
export function projectTripEarnings(
  trip: {
    bookings: Array<{
      seats: number;
      isCharter: boolean;
      fareAmount: number;
      homeSurcharge: number;
    }>;
  },
  commissionRate: number
) {
  let gross = 0;
  let surcharge = 0;
  let charter = 0;
  let seats = 0;

  for (const b of trip.bookings) {
    gross += b.fareAmount;
    surcharge += b.homeSurcharge;
    seats += b.seats;
    if (b.isCharter) charter += b.fareAmount;
  }

  const commission = Math.round(gross * commissionRate);
  return {
    grossFareTotal: gross,
    commissionAmount: commission,
    homeSurchargeAmount: surcharge,
    netPayable: Math.max(gross - commission + surcharge, 0),
    charterFareTotal: charter,
    seats,
    serviceType: charter > 0 ? "charter" : "shared",
  };
}

/**
 * Driver ride counters, DERIVED from completed trips.
 *
 * Computed rather than read from the denormalised counters on Driver, so the
 * "Rides" tile can never drift from the trip history. A count that disagreed
 * with reality would be indefensible in a payout dispute.
 */
export async function buildRideStats(driverId: string) {
  const completed = await db.trip.findMany({
    where: { driverId, status: "completed" },
    select: {
      isCharter: true,
      bookings: { where: { status: "completed" }, select: { isCharter: true, seats: true } },
    },
  });
  const isCharterTrip = (t: (typeof completed)[number]) =>
    t.isCharter || t.bookings.some((b) => b.isCharter);
  const chartered = completed.filter(isCharterTrip).length;

  return {
    tripsCompleted: completed.length,
    sharedTripsCompleted: completed.length - chartered,
    charterTripsCompleted: chartered,
    passengerSeatsCarried: completed.reduce(
      (s, t) => s + t.bookings.reduce((x, b) => x + b.seats, 0),
      0
    ),
  };
}
      boardedSeats,
      remaining: Math.max(expectedSeats - boardedSeats, 0),
      isCharter: parties.some((p) => p.isCharter),
    },
  };
}
/**
 * Licence warnings that inform without blocking. A driver should learn about an
 * approaching expiry while they can still act on it, not on the morning work
 * stops.
 */
function licenceWarnings(driver: { licenceExpiry: Date | null; licenceNumber: string | null }): string[] {
  if (!driver.licenceNumber || !driver.licenceExpiry) return [];
  const now = Date.now();
  if (driver.licenceExpiry.getTime() >= now + 30 * 86_400_000) return [];
  const days = Math.ceil((driver.licenceExpiry.getTime() - now) / 86_400_000);
  return days < 0
    ? ["Your driving licence has expired."]
    : [`Your driving licence expires in ${days} day${days === 1 ? "" : "s"}.`];
}

/**
 * Is this trip assigned to this driver?
 * The single authorisation gate used by every driver endpoint.
 */
export async function isAssignedToDriver(tripId: string, driverId: string): Promise<boolean> {
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { driverId: true } });
  return !!trip && trip.driverId === driverId;
}
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DriverAuthError, requireDriver } from "@/lib/driver-auth";
import { checkEligibility, projectTripEarnings } from "@/lib/driver-ops";

/**
 * Ride offers a driver can accept - the "Accept a ride" screen.
 *
 * An offer is a PROPOSAL, not an assignment. The driver sees it, decides, and
 * the system records the decision either way. Declining is normal and carries
 * no penalty - which is exactly why it is recorded as a first-class response
 * rather than silently ignored: dispatch needs to know how many drivers were
 * offered a trip and how many refused before it can fix the schedule.
 *
 * Only OPEN offers (or ones directed at this driver) are visible, and an offer
 * past `expiresAt` is treated as gone even if no worker has marked it yet.
 * Expiry is computed on read rather than trusted to a cron job, so a driver can
 * never accept a trip withdrawn ten minutes ago.
 */

/** GET - offers available to this driver right now. */
export async function GET(req: Request) {
  try {
    const { driver } = await requireDriver(req);
    const now = new Date();

    // An ineligible driver must not be shown work they can never accept.
    // Telling them about it is worse than silence: it teaches them that the
    // app is unreliable.
    const eligibility = await checkEligibility(driver.id);
    if (!eligibility.eligible) {
      return NextResponse.json({
        offers: [],
        eligibility,
        message: "Your documents need attention before you can accept work.",
      });
    }

    const offers = await db.rideOffer.findMany({
      where: {
        status: "offered",
        // Expiry is filtered HERE, not by a cleanup job, so a stale offer can
        // never be accepted just because the worker has not run yet.
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [{ OR: [{ offeredToId: null }, { offeredToId: driver.id }] }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        trip: {
          include: {
            route: { include: { stages: { orderBy: { order: "asc" } } } },
            train: true,
            bookings: {
              where: { status: { in: ["confirmed", "boarded"] } },
              select: { seats: true, isCharter: true, fareAmount: true, homeSurcharge: true },
            },
          },
        },
      },
    });

    // A trip the driver is ALREADY driving is not an offer to them.
    const visible = offers.filter((o) => o.trip.driverId !== driver.id && o.trip.departureAt >= now);

    return NextResponse.json({
      offers: visible.map((o) => {
        const projected = projectTripEarnings(o.trip as never, 0.15);
        const isFromTerminus = o.trip.direction === "FROM_TERMINUS";
        return {
          offerId: o.id,
          version: o.version,
          tripId: o.tripId,
          isDirectedToMe: o.offeredToId === driver.id,
          routeName: o.trip.route.name,
          direction: o.trip.direction,
          serviceType: o.trip.serviceType,
          isCharter: o.trip.isCharter,
          charterName: o.trip.charterName,
          departureAt: o.trip.departureAt,
          reportAt: o.trip.reportAt,
          pointsLabel: isFromTerminus ? "drop-off" : "pickup",
          stops: o.trip.route.stages.map((s) => ({ id: s.id, name: s.name, order: s.order })),
          expectedSeats: o.trip.bookings.reduce((s, b) => s + b.seats, 0),
          capacity: o.trip.capacity,
          train: o.trip.train
            ? {
                name: o.trip.train.name,
                mtmTime:
                  o.trip.train.direction === "MBA_TO_NBO"
                    ? o.trip.train.originTime
                    : o.trip.train.destTime,
                eventKind:
                  o.trip.train.direction === "MBA_TO_NBO" ? "departs_mtm" : "arrives_mtm",
              }
            : null,
          // Always labelled PROJECTED. This is not a guarantee of pay.
          projectedNet: projected.netPayable,
          projectedGross: projected.grossFareTotal,
          expiresAt: o.expiresAt,
          secondsToExpiry: o.expiresAt
            ? Math.max(0, Math.round((o.expiresAt.getTime() - now.getTime()) / 1000))
            : null,
        };
      }),
      eligibility,
      serverTime: now.toISOString(),
    });
  } catch (e) {
    if (e instanceof DriverAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("driver/offers GET error", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
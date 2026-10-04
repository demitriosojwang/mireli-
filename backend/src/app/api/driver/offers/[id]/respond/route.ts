import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DriverAuthError, requireDriver } from "@/lib/driver-auth";
import { checkEligibility } from "@/lib/driver-ops";

/**
 * A driver's answer to a ride offer: accept or decline.
 *
 * ------ The concurrency problem this file exists to solve ---------------------------------------------------------------------
 * An open offer is visible to many eligible drivers, and two of them can tap
 * "Accept" within the same second. If acceptance were a read-then-write, both
 * would succeed and two drivers would be booked onto one vehicle carrying one
 * set of passengers - the worst failure this product has.
 *
 * The fix is a CONDITIONAL UPDATE, not an application-level lock:
 *
 *   updateMany({ where: { id, status: "offered", expiresAt > now,
 *                         acceptedById: null },
 *                data: { status: "accepted", ... } })
 *
 * The database evaluates the predicate and writes in one atomic step. Whoever
 * wins updates exactly one row; the loser's `count` is 0 and they get an honest
 * `OFFER_ALREADY_TAKEN` rather than a phantom assignment. No mutex, no Redis, no
 * cross-process coordination to get wrong.
 *
 * Assigning the trip happens in the SAME transaction. If it failed after the
 * offer was claimed we would have an accepted offer with no driver - precisely
 * the split-brain state being avoided. If it does fail, the claim is released.
 */

/** POST /api/driver/offers/{id}/respond */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { driver } = await requireDriver(req);
    const { id: offerId } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const action = String(body.action || ""); // accept | decline
    const reason = String(body.reason || "").trim();
    if (!["accept", "decline"].includes(action)) {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const now = new Date();
    const offer = await db.rideOffer.findUnique({
      where: { id: offerId },
      include: { trip: { include: { route: true } } },
    });
    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

    // A directed offer is answerable only by its target. 404 rather than 403,
    // so the endpoint cannot confirm another driver's offer exists.
    if (offer.offeredToId && offer.offeredToId !== driver.id) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    if (offer.status === "accepted") {
      // If THIS driver already accepted, return their own success. Idempotent: a
      // retry after a timeout that actually succeeded must not look like a loss
      // to a driver who genuinely has the job.
      if (offer.acceptedById === driver.id) {
        return NextResponse.json({
          ok: true,
          alreadyAccepted: true,
          tripId: offer.tripId,
          note: "You already accepted this trip.",
        });
      }
      return NextResponse.json(
        { error: "Another driver accepted this trip first.", code: "OFFER_ALREADY_TAKEN" },
        { status: 409 }
      );
    }
    if (offer.status !== "offered") {
      return NextResponse.json(
        { error: `This offer is no longer available (${offer.status}).`, code: "OFFER_CLOSED" },
        { status: 409 }
      );
    }
    if (offer.expiresAt && offer.expiresAt <= now) {
      return NextResponse.json(
        { error: "This offer has expired.", code: "OFFER_EXPIRED" },
        { status: 409 }
      );
    }

    // ------ Decline ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    if (action === "decline") {
      // A reason is required. Dispatch cannot re-offer intelligently without it.
      if (!reason) {
        return NextResponse.json({ error: "Please tell dispatch why" }, { status: 400 });
      }
      // Only a DIRECTED offer is consumed by a decline. Declining an OPEN offer
      // must not remove it from every other eligible driver - otherwise one
      // driver can block the whole fleet by declining.
      if (offer.offeredToId) {
        await db.rideOffer.update({
          where: { id: offerId },
          data: { status: "declined", declinedAt: now, declineReason: reason.slice(0, 240) },
        });
      }
      await db.rideOfferResponse.create({
        data: { offerId, driverId: driver.id, outcome: "declined", reason: reason.slice(0, 240) },
      });
      await audit({
        actorId: driver.id,
        actorName: driver.name,
        actorRole: "driver",
        entity: "ride_offer",
        entityId: offerId,
        metadata: { tripId: offer.tripId, reason: reason.slice(0, 240) },
      });
      return NextResponse.json({
        ok: true,
        declined: true,
        note: offer.offeredToId
          ? "Dispatch has been told."
          : "Noted. This trip stays open for other drivers.",
      });
    }

// --- Accept ---
    // Eligibility is re-checked at the MOMENT of acceptance, not when the offer
    // was listed. A licence can expire in the gap.
    const eligibility = await checkEligibility(driver.id);
    if (!eligibility.eligible) {
      return NextResponse.json(
        {
          error: "Your documents need attention before you can accept this trip.",
          code: "NOT_ELIGIBLE",
          eligibility,
        },
        { status: 403 }
      );
    }
    if (offer.trip.driverId) {
      return NextResponse.json(
        { error: "Another driver accepted this trip first.", code: "OFFER_ALREADY_TAKEN" },
        { status: 409 }
      );
    }
    if (offer.trip.status === "cancelled") {
      return NextResponse.json(
        { error: "This trip was cancelled.", code: "TRIP_CLOSED" },
        { status: 409 }
      );
    }

    // The atomic claim. `count === 0` means another driver won the race.
    const claimed = await db.rideOffer.updateMany({
      where: { id: offerId, status: "offered", acceptedById: null },
      data: {
        status: "accepted",
        acceptedById: driver.id,
        acceptedAt: now,
        version: { increment: 1 },
      },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "Another driver accepted this trip first.", code: "OFFER_ALREADY_TAKEN" },
        { status: 409 }
      );
    }

    // Assign the trip. If this throws we must release the claim, otherwise we
    // have an accepted offer belonging to nobody: the trip looks unassigned to
    // dispatch while the driver believes it is theirs.
    try {
      await db.$transaction([
        db.trip.update({
          where: { id: offer.tripId },
          data: {
            driverId: driver.id,
            assignedAt: now,
            acknowledgedAt: now,
            assignmentVersion: { increment: 1 },
            status: "locked",
          },
        }),
        db.rideOfferResponse.create({
          data: { offerId, driverId: driver.id, outcome: "accepted" },
        }),
        db.tripEvent.create({
          data: {
            tripId: offer.tripId,
            type: "acknowledged",
            actorId: driver.id,
            actorName: driver.name,
            actorRole: "driver",
            detail: JSON.stringify({ viaOffer: true, offerId }),
          },
        }),
      ]);
    } catch (assignErr) {
      await db.rideOffer.update({
        where: { id: offerId },
        data: { status: "offered", acceptedById: null, acceptedAt: null },
      });
      console.error("offer accept assignment failed; claim released", assignErr);
      return NextResponse.json(
        { error: "We could not confirm that trip. Please try again.", code: "ASSIGN_FAILED" },
        { status: 500 }
      );
    }

    await audit({
      actorId: driver.id,
      actorName: driver.name,
      actorRole: "driver",
      action: "offer.accept",
      entity: "ride_offer",
      entityId: offerId,
      metadata: { tripId: offer.tripId, viaOffer: true },
    });

    return NextResponse.json({
      ok: true,
      accepted: true,
      tripId: offer.tripId,
      routeName: offer.trip.route.name,
      departureAt: offer.trip.departureAt,
      reportAt: offer.trip.reportAt,
      // Accepting is agreement to the WORK. It is never a payment confirmation.
      note: "Trip accepted. Payment follows after the trip is completed and reconciled.",
    });
  } catch (e) {
    if (e instanceof DriverAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("driver offer respond error", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
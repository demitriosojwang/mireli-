import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DriverAuthError, requireDriver } from "@/lib/driver-auth";
import { checkEligibility, buildRideStats } from "@/lib/driver-ops";

/**
 * The driver's own profile, eligibility, compliance status and ride counters.
 * Powers the Account tab.
 *
 * There is no parameter that can widen this into another driver's data. The
 * driver's own national ID is returned to them, but it never appears in any
 * passenger-facing or manifest projection.
 */

/** GET - profile, eligibility, documents, subscription and notices. */
export async function GET(req: Request) {
  try {
    const { driver } = await requireDriver(req);
    const record = await db.driver.findUnique({
      where: { id: driver.id },
      include: { documents: { orderBy: { createdAt: "desc" } } },
    });
    if (!record) return NextResponse.json({ error: "Driver not found" }, { status: 404 });

    const [eligibility, rides] = await Promise.all([
      checkEligibility(driver.id),
      buildRideStats(driver.id),
    ]);

    const subscriptions = await db.charterSubscription.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: "desc" },
    });
    const notices = await db.driverNotification.findMany({
      where: { driverId: driver.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    return NextResponse.json({
      driver: {
        id: record.id,
        name: record.name,
        phone: record.phone,
        plate: record.plate,
        cabType: record.cabType,
        capacity: record.capacity,
        status: record.status,
        statusReason: record.statusReason,
        licenceNumber: record.licenceNumber,
        licenceClass: record.licenceClass,
        licenceExpiry: record.licenceExpiry,
        available: record.available,
        availableSince: record.availableSince,
        nationalId: record.nationalId,
      },
      eligibility,
      rides,
      // Documents expose review state and expiry, never a downloadable URL.
      // Files live in private storage behind short-lived signed links issued
      // through a dedicated, audited endpoint.
      documents: record.documents.map((d) => ({
        id: d.id,
        type: d.type,
        displayName: d.displayName,
        status: d.status,
        rejectReason: d.rejectReason,
        expiresAt: d.expiresAt,
        reviewedAt: d.reviewedAt,
      })),
      subscription: {
        active:
          record.subscriptionActive &&
          (!record.subscriptionExpiresAt || record.subscriptionExpiresAt > new Date()),
        expiresAt: record.subscriptionExpiresAt,
        current: subscriptions.find((s) => s.status === "active") ?? null,
        history: subscriptions.slice(0, 10),
      },
      notifications: notices.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        severity: n.severity,
        tripId: n.tripId,
        createdAt: n.createdAt,
        read: !!n.readAt,
      })),
    });
  } catch (e) {
    if (e instanceof DriverAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("driver/me error", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/**
 * POST - set availability.
 *
 * Turning availability ON is an INTENT, never an assignment. The ops engine
 * decides what a driver actually gets; the app asking for work does not create
 * it. Availability ON is also refused while ineligible, so the driver is not
 * left waiting for assignments dispatch will never send.
 */
export async function POST(req: Request) {
  try {
    const { driver } = await requireDriver(req);
    const body = await req.json().catch(() => ({}));
    const available = Boolean(body.available);

    if (available) {
      const eligibility = await checkEligibility(driver.id);
      if (!eligibility.eligible) {
        return NextResponse.json(
          { error: "Your documents need attention before you can take work.", eligibility },
          { status: 403 }
        );
      }
    }

    await db.driver.update({
      where: { id: driver.id },
      data: { available, availableSince: available ? new Date() : null },
    });

    return NextResponse.json({
      ok: true,
      available,
      // Shown in the app so availability is not an open-ended promise.
      assignmentHorizonHours: 36,
    });
  } catch (e) {
    if (e instanceof DriverAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("driver availability error", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
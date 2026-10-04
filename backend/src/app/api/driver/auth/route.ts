import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  DriverAuthError,
  issueSession,
  normalizeDriverPhone,
  requestOtp,
  revokeSession,
  requireDriver,
  verifyOtp,
} from "@/lib/driver-auth";

/**
 * Driver login for the Mireli Driver Android app.
 *
 * Flow mirrors the passenger site (request -> verify) but is a completely
 * separate credential path: a driver session can never be used against
 * passenger or admin routes, and vice versa.
 *
 * Anti-enumeration is deliberate. `request` always returns the same response
 * shape whether or not the phone belongs to a driver, so this endpoint cannot
 * be used to discover which phone numbers are registered to Mi-Reli.
 */

/** POST - step: request a code, exchange one for a bearer token, or sign out. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const step = String(body.step || "");

  try {
    if (step === "request") {
      const phone = normalizeDriverPhone(String(body.phone || ""));
      if (!phone) {
        return NextResponse.json(
          { error: "Enter a valid phone number, e.g. 0712 345 678" },
          { status: 400 }
        );
      }
      const result = requestOtp(phone);
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, cooldownSeconds: result.cooldownSeconds },
          { status: 429 }
        );
      }
      // Always the same shape - never reveals whether the number is registered.
      return NextResponse.json({ ok: true, cooldownSeconds: result.cooldownSeconds });
    }

    if (step === "verify") {
      const phone = normalizeDriverPhone(String(body.phone || ""));
      const code = String(body.code || "").trim();
      if (!phone || !code) {
        return NextResponse.json({ error: "Phone number and code are required" }, { status: 400 });
      }

      const check = verifyOtp(phone, code);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 401 });
      }

      const driver = await db.driver.findUnique({ where: { phone } });
      // Same generic failure as a wrong code: do not disclose that the number
      // exists but is not a driver.
      if (!driver) {
        return NextResponse.json(
          { error: "That code is not valid. Request a new one." },
          { status: 401 }
        );
      }
      if (driver.status === "suspended") {
        return NextResponse.json(
          { error: driver.statusReason || "Your account is suspended. Please contact Mi-Reli dispatch." },
          { status: 403 }
        );
      }

      const { token, expiresAt } = await issueSession({
        driverId: driver.id,
        deviceId: body.deviceId ? String(body.deviceId) : null,
        deviceLabel: body.deviceLabel ? String(body.deviceLabel).slice(0, 80) : null,
        appVersion: body.appVersion ? String(body.appVersion).slice(0, 32) : null,
      });

      await db.driver.update({
        where: { id: driver.id },
        data: { lastSeenAt: new Date() },
      });
      await audit({
        actorId: driver.id,
        actorName: driver.name,
        actorRole: "driver",
        action: "driver.auth.login",
        entity: "driver",
        entityId: driver.id,
        metadata: { deviceId: body.deviceId ?? null, appVersion: body.appVersion ?? null },
      });

      return NextResponse.json({
        ok: true,
        token,
        expiresAt,
        driver: { id: driver.id, name: driver.name, plate: driver.plate },
      });
    }

    if (step === "logout") {
      // Revokes exactly this session, so a driver signed out on a lost phone
      // keeps their session on their own handset.
      const { sessionId } = await requireDriver(req);
      await revokeSession(sessionId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  } catch (e) {
    if (e instanceof DriverAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("driver auth error", e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
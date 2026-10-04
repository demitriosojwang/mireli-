import crypto from "crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * Driver authentication for the Mireli Driver Android app.
 *
 * Deliberately separate from the web's signed cookie. A browser can hold an
 * httpOnly cookie; an Android app cannot. It needs a bearer token it can attach
 * per request, rotate, and revoke PER DEVICE — otherwise losing a phone is an
 * unrecoverable account takeover. Sharing one mechanism would also let a driver
 * session act against passenger or admin routes.
 *
 * Security properties, in priority order:
 *   1. The raw token is NEVER stored — only SHA-256(token). A database dump
 *      cannot be replayed as a live login.
 *   2. Sessions are revocable individually, so signing out one phone does not
 *      sign the driver out everywhere.
 *   3. A verified phone proves control of a NUMBER, nothing more. It does not
 *      grant driving privileges: `driver.status` and the reviewed document set
 *      do, and both are re-evaluated on every request.
 *   4. Lookup is an indexed hash read, never a token scan.
 */

const DRIVER_SESSION_DAYS = 30;
const DRIVER_SESSION_MS = DRIVER_SESSION_DAYS * 24 * 60 * 60 * 1000;

/** SHA-256 of the bearer token — what we actually store and index. */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** A cryptographically random, unguessable session token. */
function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// ─── OTP ─────────────────────────────────────────────────────────────────────

/**
 * OTP challenges live in memory ONLY. They are deliberately not persisted: a
 * code that survives a restart is a code an attacker can reuse later, and a
 * driver login is a short, human-scale interaction where in-memory suffices.
 *
 * `isDemoOtpActive()` preserves the prototype behaviour (any fixed code works)
 * so the app can be built before SMS is provisioned. It MUST be off in
 * production — do not ship it enabled.
 */
const DEMO_OTP = "1234";

interface OtpEntry {
  code: string;
  expiresAt: number;
  attemptsLeft: number;
}

const otpStore = new Map<string, OtpEntry>();

/** In non-production, any fixed code is accepted so the app is testable. */
export function isDemoOtpActive(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.DEMO_DRIVER_OTP === "1";
}

/** Throttle: one live challenge per phone, plus a cooldown before re-sending. */
const OTP_COOLDOWN_MS = 30_000;
const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;

export function requestOtp(phone: string): {
  ok: boolean;
  cooldownSeconds?: number;
  error?: string;
} {
  const existing = otpStore.get(phone);
  if (existing && existing.expiresAt > Date.now()) {
    const sentAt = existing.expiresAt - OTP_TTL_MS;
    const elapsed = Date.now() - sentAt;
    if (elapsed < OTP_COOLDOWN_MS) {
      return {
        ok: false,
        cooldownSeconds: Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000),
        error: "Please wait before requesting another code",
      };
    }
  }
  const code = isDemoOtpActive() ? DEMO_OTP : String(crypto.randomInt(100000, 999999));
  otpStore.set(phone, {
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
    attemptsLeft: OTP_MAX_ATTEMPTS,
  });
  return { ok: true, cooldownSeconds: OTP_COOLDOWN_MS / 1000 };
}

export function verifyOtp(phone: string, code: string): { ok: boolean; error?: string } {
  const entry = otpStore.get(phone);
  if (!entry) return { ok: false, error: "Request a new code" };
  if (entry.expiresAt < Date.now()) {
    otpStore.delete(phone);
// ─── Sessions ────────────────────────────────────────────────────────────────

export async function issueSession(params: {
  driverId: string;
  deviceId?: string | null;
  deviceLabel?: string | null;
  appVersion?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + DRIVER_SESSION_MS);
  await db.driverSession.create({
    data: {
      driverId: params.driverId,
      tokenHash: hashToken(token),
      deviceId: params.deviceId ?? null,
      deviceLabel: params.deviceLabel ?? null,
      appVersion: params.appVersion ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

/**
 * Resolve a bearer token to its driver.
 *
 * Returns `null` for every failure mode (unknown, expired, revoked) so the
 * caller cannot distinguish them for an attacker. Also refreshes `lastSeenAt`,
 * which is ops visibility only and must never be treated as proof of activity.
 */
export async function getDriverSession(
  token: string | null | undefined
): Promise<{ driverId: string; sessionId: string } | null> {
  if (!token) return null;
  const record = await db.driverSession.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record) return null;
  if (record.revokedAt) return null;
  if (record.expiresAt < new Date()) return null;
  await db.driverSession.update({
    where: { id: record.id },
    data: { lastSeenAt: new Date() },
  });
  return { driverId: record.driverId, sessionId: record.id };
}

/** Revoke one session — signing out a single device, not the whole account. */
export async function revokeSession(sessionId: string): Promise<void> {
  await db.driverSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revoke every session — used on suspension or a phone-number change. */
export async function revokeAllSessions(driverId: string, reason: string): Promise<number> {
  const res = await db.driverSession.updateMany({
    where: { driverId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await audit({
    actorId: "system",
    actorName: "Driver Auth",
    actorRole: "system",
    action: "driver.session.revoke_all",
    entity: "driver",
    entityId: driverId,
    metadata: { reason, revoked: res.count },
  });
  return res.count;
}

/** A rejected driver action: HTTP status plus a driver-safe message. */
export class DriverAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "DriverAuthError";
  }
}

/**
 * Resolve the caller from an `Authorization: Bearer` header.
 *
 * Re-reads `driver.status` on EVERY request rather than trusting the token. A
 * suspension must take effect immediately — a long-lived token must never
 * outlive the privilege it granted, or "we suspended him yesterday" becomes "he
 * was still working today".
 */
export async function requireDriver(req: Request): Promise<{
  driver: {
    id: string;
    name: string;
    phone: string;
    plate: string;
    cabType: string;
    capacity: number;
    status: string;
    statusReason: string | null;
    licenceExpiry: Date | null;
    subscriptionActive: boolean;
    subscriptionExpiresAt: Date | null;
    available: boolean;
  };
  sessionId: string;
}> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  const session = await getDriverSession(token);
  if (!session) {
    throw new DriverAuthError("Your session has expired. Please sign in again.", 401);
  }
  const driver = await db.driver.findUnique({ where: { id: session.driverId } });
  if (!driver) throw new DriverAuthError("Driver account not found", 401);
  if (driver.status === "suspended") {
    throw new DriverAuthError(
      driver.statusReason || "Your account is suspended. Contact dispatch.",
      403
    );
  }
  return {
    driver: {
      id: driver.id,
      name: driver.name,
      phone: driver.phone,
      plate: driver.plate,
      cabType: driver.cabType,
      capacity: driver.capacity,
      status: driver.status,
      statusReason: driver.statusReason,
      licenceExpiry: driver.licenceExpiry,
      subscriptionActive: driver.subscriptionActive,
      subscriptionExpiresAt: driver.subscriptionExpiresAt,
      available: driver.available,
    },
    sessionId: session.sessionId,
  };
}

/** Normalise + validate a Kenyan driver phone. */
export function normalizeDriverPhone(input: string): string | null {
  const digits = String(input || "").replace(/[^\d+]/g, "");
  let n = digits.startsWith("+") ? digits.slice(1) : digits;
  if (n.startsWith("254")) n = n.slice(3);
  else if (n.startsWith("0")) n = n.slice(1);
  return /^[17]\d{8}$/.test(n) ? `+254${n}` : null;
}
    return { ok: false, error: "That code has expired. Request a new one." };
  }
  if (entry.attemptsLeft <= 0) {
    otpStore.delete(phone);
    return { ok: false, error: "Too many attempts. Request a new code." };
  }
  if (entry.code !== code.trim()) {
    entry.attemptsLeft -= 1;
    if (entry.attemptsLeft <= 0) otpStore.delete(phone);
    return { ok: false, error: "Incorrect code" };
  }
  otpStore.delete(phone);
  return { ok: true };
}
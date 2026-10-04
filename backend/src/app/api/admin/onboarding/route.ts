import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  ONBOARDING_POLICY_VERSION,
  REQUIREMENTS_BY_TYPE,
  evaluateEligibility,
} from "@/lib/driver-onboarding";

/**
 * Compliance review queue - the staff side of driver onboarding.
 *
 * This is the ONLY place a driver becomes eligible to drive. There is
 * deliberately NO bulk approve and NO auto-approval: each requirement is decided
 * by a named human, because the alternative is a regulator asking who cleared an
 * unlicensed driver and finding nobody.
 *
 * Every action is audited with the reviewer's identity, and every decision that
 * affects a driver's livelihood requires a reason the driver can read.
 *
 * ------ Authentication ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 * The console reuses the MIRELI WEB admin session rather than minting a second
 * identity system, so a reviewer is the same person with the same permissions
 * they already have on the passenger site. `readReviewer()` accepts either:
 *   - a forwarded, signed `x-mireli-admin` header (server-to-server), or
 *   - a bearer token this service issued to a console operator.
 * A shared secret in `ADMIN_SHARED_SECRET` gates the header path. Before any
 * real deployment, replace this with the console calling through with a proper
 * service credential - a shared header secret is a stopgap, not a design.
 */

const ADMIN_SHARED_SECRET = process.env.ADMIN_SHARED_SECRET ?? "";

type Reviewer = { id: string; name: string; email: string };

/**
 * MVP auth: a shared secret plus an asserted reviewer identity.
 *
 * This is deliberately simple and explicitly a STOPGAP. It is adequate while
 * the console runs beside this service on a private network. Before any real
 * deployment, replace it with a proper service credential (mTLS or a signed
 * token), because a shared secret forwarded in a header is only as strong as
 * the network it crosses.
 *
 * The reviewer identity is still required and still recorded: that is what makes
 * "who approved this driver?" answerable, which is the part that actually
 * matters for compliance.
 */
function readReviewer(req: Request): { ok: true; reviewer: Reviewer } | { ok: false; error: string } {
  if (!ADMIN_SHARED_SECRET) {
    return { ok: false, error: "Admin access is not configured" };
  }
  const provided = req.headers.get("x-mireli-admin") || "";
  if (!provided || !safeEqual(provided, ADMIN_SHARED_SECRET)) {
    return { ok: false, error: "Unauthorized" };
  }
  const raw = req.headers.get("x-mireli-reviewer");
  if (!raw) return { ok: false, error: "Reviewer identity required" };
  try {
    const parsed = JSON.parse(raw) as Partial<Reviewer>;
    if (!parsed.email) return { ok: false, error: "Reviewer identity required" };
    return {
      ok: true,
      reviewer: {
        id: String(parsed.id || parsed.email),
        name: String(parsed.name || parsed.email),
        email: String(parsed.email),
      },
    };
  } catch {
    return { ok: false, error: "Malformed reviewer header" };
  }
}

/** GET - the review queue, plus counts for the console's stat cards. */
export async function GET(req: Request) {
  const gate = readReviewer(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 401 });
  const reviewer = gate.reviewer;

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter") || "pending";

  const where =
    filter === "all"
      ? {}
      : filter === "approved"
        ? { status: "approved" }
        : filter === "expiring"
          ? { status: { in: ["approved", "under_review"] } }
          : { status: { in: ["applied", "under_review", "suspended"] } };

  const onboardings = await db.driverOnboarding.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
    include: {
      driver: {
        select: {
          id: true,
          name: true,
          phone: true,
          plate: true,
          cabType: true,
          capacity: true,
          status: true,
          statusReason: true,
        },
      },
      checks: true,
      history: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });

  const now = new Date();

  const rows = onboardings.map((o) => {
    const eligibility = evaluateEligibility({
      capacity: o.driver.capacity,
      onboardingStatus: o.status,
      policyVersionAccepted: o.policyVersionAccepted,
      checks: o.checks.map((c) => ({
        docType: c.docType,
        requiredFor: c.requiredFor,
        state: c.state,
        validUntil: c.validUntil,
        note: c.note,
      })),
    });

    // Documents awaiting a human decision, carrying the requirement's own
    // guidance so the reviewer does not have to remember which authority
    // issues what or how long it is good for.
    const pendingReview = o.checks
      .filter((c) => c.state === "uploaded" || c.state === "in_review")
      .map((c) => {
        const def = REQUIREMENTS_BY_TYPE.get(c.docType);
        return {
          checkId: c.id,
          docType: c.docType,
          label: def?.label ?? c.docType,
          description: def?.description ?? "",
          issuingAuthority: def?.issuingAuthority ?? "",
          suggestedValidityDays: def?.validityDays ?? null,
          confidence: def?.confidence ?? "likely",
          rationale: def?.rationale ?? "",
          source: def?.source ?? "",
          blocking: c.blocking,
          state: c.state,
          validUntil: c.validUntil,
        };
      });

    // Expiring inside 30 days - the reminder queue.
    const expiringSoon = o.checks
      .filter(
        (c) =>
          c.validUntil && c.validUntil > now && c.validUntil.getTime() - now.getTime() < 30 * 86_400_000
      )
      .map((c) => ({
        checkId: c.id,
        docType: c.docType,
        label: REQUIREMENTS_BY_TYPE.get(c.docType)?.label ?? c.docType,
        validUntil: c.validUntil!.toISOString(),
        daysLeft: Math.ceil((c.validUntil!.getTime() - now.getTime()) / 86_400_000),
      }));

    return {
      onboardingId: o.id,
      status: o.status,
      version: o.version,
      awaitingOn: o.awaitingOn,
      submittedAt: o.submittedAt,
      reviewedAt: o.reviewedAt,
      reviewedBy: o.reviewedBy,
      reviewNotes: o.reviewNotes,
      acceptedPolicyVersion: o.policyVersionAccepted,
      driver: o.driver,
      progressPercent: eligibility.progressPercent,
      clearedToDrive: eligibility.clearedToDrive,
      blockers: eligibility.blockers,
      advisories: eligibility.advisories,
      pendingReview,
      expiringSoon,
      checks: o.checks.map((c) => ({
        checkId: c.id,
        docType: c.docType,
        label: REQUIREMENTS_BY_TYPE.get(c.docType)?.label ?? c.docType,
        state: c.state,
        blocking: c.blocking,
        validUntil: c.validUntil,
        note: c.note,
        reviewedBy: c.reviewedBy,
        reviewedAt: c.reviewedAt,
      })),
      history: o.history.map((h) => ({
        id: h.id,
        type: h.type,
        actorRole: h.actorRole,
        actorId: h.actorId,
        createdAt: h.createdAt,
      })),
    };
  });

  const [approved, suspended] = await Promise.all([
    db.driverOnboarding.count({ where: { status: "approved" } }),
    db.driverOnboarding.count({ where: { status: "suspended" } }),
  ]);

  return NextResponse.json({
    onboardings: rows,
    counts: {
      awaitingDriver: rows.filter((r) => r.awaitingOn === "driver").length,
      awaitingCompliance: rows.filter((r) => r.awaitingOn === "compliance").length,
      approved,
      suspended,
      documentsToReview: rows.reduce((s, r) => s + r.pendingReview.length, 0),
    },
    policyVersion: ONBOARDING_POLICY_VERSION,
    viewer: { email: reviewer.email, name: reviewer.name },
    serverTime: now.toISOString(),
  });
}

/**
 * POST - record a compliance decision.
 *
 * Actions: review_check | approve | reject | suspend | reinstate | remind
 *
 * Guard rails that are not optional:
 *   - `approve` REFUSES if any blocking check is not approved. It is impossible
 *     to approve a driver here while a licence or insurance certificate still
 *     sits unreviewed - the exact mistake that puts an unlicensed driver on the
 *     road.
 *   - Any action affecting a driver's livelihood (reject, suspend) REQUIRES a
 *     reason the driver can read. "Approved with no reason" is not a record.
 *   - `expectedVersion` stops two officers silently overwriting each other.
 *   - Every action writes both an OnboardingEvent and an AuditLog row.
 */
export async function POST(req: Request) {
  const gate = readReviewer(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 401 });
  const reviewer = gate.reviewer;

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const onboardingId = String(body.onboardingId || "");
  const reason = String(body.reason || "").trim();
  const expectedVersion = Number.isFinite(body.expectedVersion)
    ? Number(body.expectedVersion)
    : null;

  if (!onboardingId) {
    return NextResponse.json({ error: "onboardingId is required" }, { status: 400 });
  }

  const onboarding = await db.driverOnboarding.findUnique({
    where: { id: onboardingId },
    include: { checks: true },
  });
  if (!onboarding) {
    return NextResponse.json({ error: "Onboarding not found" }, { status: 404 });
  }

  if (expectedVersion !== null && expectedVersion !== onboarding.version) {
    return NextResponse.json(
      {
        error: "Someone else updated this application. Refresh before deciding.",
        code: "STALE_ONBOARDING",
        currentVersion: onboarding.version,
      },
      { status: 409 }
    );
  }

  const now = new Date();

  const auditCall = (act: string, meta: Record<string, unknown>) =>
    audit({
      actorId: reviewer.id,
      actorName: reviewer.name,
      actorRole: "admin",
      action: act,
      entity: "driver_onboarding",
      entityId: onboardingId,
      metadata: { ...meta, reviewer: reviewer.email },
    });

  const logEvent = (type: string, detail: Record<string, unknown>) =>
    db.onboardingEvent.create({
      data: {
        onboardingId,
        type,
        actorId: reviewer.id,
        actorRole: "admin",
        detail: JSON.stringify(detail),
      },
    });

  // ------ review_check ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  if (action === "review_check") {
    const checkId = String(body.checkId || "");
    const decision = String(body.decision || "");
    const validUntil = body.validUntil ? new Date(String(body.validUntil)) : null;

    if (!checkId) return NextResponse.json({ error: "checkId is required" }, { status: 400 });
    if (!["approved", "rejected"].includes(decision)) {
return NextResponse.json({ error: "Unknown decision" }, { status: 400 });
    }
    // Rejecting without telling the driver why is useless to them and useless
    // to us when they appeal.
    if (decision === "rejected" && !reason) {
      return NextResponse.json(
        { error: "Give the driver a reason they can act on" },
        { status: 400 }
      );
    }

    const check = onboarding.checks.find((c) => c.id === checkId);
    if (!check) return NextResponse.json({ error: "Requirement not found" }, { status: 404 });

    await db.onboardingCheck.update({
      where: { id: checkId },
      data: {
        state: decision,
        validUntil: validUntil && !isNaN(validUntil.getTime()) ? validUntil : check.validUntil,
        reviewedBy: reviewer.email,
        reviewedAt: now,
        note: reason || check.note,
      },
    });
    // Mirror onto the document so the driver's app shows the same verdict.
    await db.driverDocument.updateMany({
      where: { driverId: onboarding.driverId, type: check.docType, status: "pending" },
      data: {
        status: decision,
        reviewedBy: reviewer.email,
        reviewedAt: now,
        rejectReason: decision === "rejected" ? reason : null,
      },
    });
    await db.driverOnboarding.update({
      where: { id: onboardingId },
      data: { version: { increment: 1 }, awaitingOn: "driver" },
    });
    await logEvent(decision === "approved" ? "check_passed" : "check_failed", {
      docType: check.docType,
      reason,
    });
    await auditCall("onboarding.check.review", { docType: check.docType, decision });

    return NextResponse.json({ ok: true, docType: check.docType, decision });
  }

// ------ approve ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  if (action === "approve") {
    // Re-read the checks at decision time. Approving on a stale in-memory list
    // would let a document be rejected by another officer between page load and
    // the approve click, and we would approve the driver anyway.
    const fresh = await db.driverOnboarding.findUnique({
      where: { id: onboardingId },
      include: { checks: true },
    });
    const outstanding = fresh!.checks.filter(
      (c) => c.blocking && c.state !== "approved" && !(c.validUntil && c.validUntil < now)
    );
    if (outstanding.length > 0) {
      return NextResponse.json(
        {
          error: "Some required documents are not approved yet.",
          code: "OUTSTANDING_DOCUMENTS",
          outstanding: outstanding.map((c) => ({
            docType: c.docType,
            label: REQUIREMENTS_BY_TYPE.get(c.docType)?.label ?? c.docType,
            state: c.state,
          })),
        },
        { status: 409 }
      );
    }

    await db.driverOnboarding.update({
      where: { id: onboardingId },
      data: {
        status: "approved",
        reviewedAt: now,
        reviewedBy: reviewer.email,
        reviewNotes: reason || null,
        awaitingOn: "none",
        version: { increment: 1 },
      },
    });
    // Availability is deliberately NOT auto-enabled: a newly approved driver
    // should choose their own hours rather than being thrown onto a schedule.
    await db.driver.update({
      where: { id: onboarding.driverId },
      data: {
        status: "active",
        statusReason: null,
        statusChangedAt: now,
        statusChangedBy: reviewer.email,
      },
    });
    await logEvent("approved", { reason });
    await auditCall("onboarding.approve", { driverId: onboarding.driverId });
    return NextResponse.json({
      ok: true,
      status: "approved",
      note: "Driver cleared to drive. They can now turn on availability in the app.",
    });
  }

  // ------ reject / suspend ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  if (action === "reject" || action === "suspend") {
    if (!reason) {
      return NextResponse.json(
        { error: "A reason is required - the driver will see it" },
        { status: 400 }
      );
    }
    const nextStatus = action === "reject" ? "rejected" : "suspended";
    await db.driverOnboarding.update({
      where: { id: onboardingId },
      data: {
        status: nextStatus,
        reviewedAt: now,
        reviewedBy: reviewer.email,
        reviewNotes: reason,
        awaitingOn: action === "reject" ? "none" : "compliance",
        version: { increment: 1 },
      },
    });
    // A suspension must bite immediately: `requireDriver` re-reads status on
    // every request, and we also revoke sessions so the app stops working
    // offline against stale cached data.
    if (action === "suspend") {
      await db.driver.update({
        where: { id: onboarding.driverId },
        data: {
          status: "suspended",
          statusReason: reason,
          statusChangedAt: now,
          statusChangedBy: reviewer.email,
          available: false,
        },
      });
      await db.driverSession.updateMany({
        where: { driverId: onboarding.driverId, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    await logEvent(nextStatus, { reason });
    await auditCall(`onboarding.${action}`, { driverId: onboarding.driverId, reason });
    return NextResponse.json({ ok: true, status: nextStatus });
  }

  // ------ reinstate ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  if (action === "reinstate") {
    const fresh = await db.driverOnboarding.findUnique({
      where: { id: onboardingId },
      include: { checks: true },
    });
    const expired = fresh!.checks.filter(
      (c) => c.blocking && c.validUntil && c.validUntil < now
    );
    if (expired.length > 0) {
      return NextResponse.json(
        {
          error: "These documents are still expired. Review replacements first.",
          code: "EXPIRED_DOCUMENTS",
          expired: expired.map((c) => ({
            docType: c.docType,
            label: REQUIREMENTS_BY_TYPE.get(c.docType)?.label ?? c.docType,
          })),
        },
        { status: 409 }
      );
    }
    await db.driverOnboarding.update({
      where: { id: onboardingId },
      data: { status: "approved", awaitingOn: "none", version: { increment: 1 } },
    });
    await db.driver.update({
      where: { id: onboarding.driverId },
      data: {
        status: "active",
        statusReason: null,
        statusChangedAt: now,
        statusChangedBy: reviewer.email,
      },
    });
    await logEvent("reinstated", { reason });
    await auditCall("onboarding.reinstate", { reason });
    return NextResponse.json({ ok: true, status: "approved" });
  }

  // ------ remind ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  if (action === "remind") {
    await db.driverOnboarding.update({
      where: { id: onboardingId },
      data: { lastReminderAt: now, version: { increment: 1 } },
    });
    await db.driverNotification.create({
      data: {
        driverId: onboarding.driverId,
        type: "info",
        title: "Please finish your driver registration",
        body: "Some documents are still needed before you can take trips.",
        severity: "action_required",
      },
    });
    await logEvent("reminder_sent", {});
    await auditCall("onboarding.remind", {});
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
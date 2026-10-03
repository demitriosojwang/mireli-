"use client";

import type { OnboardingRow } from "@/lib/api";
import { CONFIDENCE_LABEL, STATUS_LABEL, STATUS_PILL, cn, fmtDate, relativeDays } from "@/lib/utils";

/**
 * One driver's compliance state.
 *
 * The card answers three questions in priority order, because that is the order
 * a compliance officer asks them:
 *   1. Who is this and what are they driving?
 *   2. What is stopping them right now?
 *   3. Is anything about to expire?
 *
 * Colour is never the only signal — every pill carries a word, so the card is
 * readable by a colour-blind reviewer and in direct sunlight.
 */
export function DriverCard({ row, onOpen }: { row: OnboardingRow; onOpen: () => void }) {
  const pill = STATUS_PILL[row.status] ?? STATUS_PILL.missing;
  const awaitingDriver = row.awaitingOn === "driver";
  const outstanding = row.blockers.length;
  const expiring = row.expiringSoon.length;

  return (
    <button onClick={onOpen} className="mi-group w-full text-left">
      <div className="p-4">
        {/* ── Identity ─────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--mi-fill)] text-[0.9375rem] font-bold text-[var(--mi-label-2)]"
          >
            {row.driver.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="mi-title truncate">{row.driver.name}</h2>
              <span
                className="mi-pill"
                style={{ background: pill.bg, color: pill.fg }}
              >
                {STATUS_LABEL[row.status] ?? row.status}
              </span>
              {row.clearedToDrive && (
                <span
                  className="mi-pill"
                  style={{ background: STATUS_PILL.approved.bg, color: STATUS_PILL.approved.fg }}
                >
                  ✓ Cleared
                </span>
              )}
            </div>
            <p className="mi-sub mt-0.5 truncate">
              {row.driver.plate} · {row.driver.cabType} · {row.driver.capacity} seats
            </p>
          </div>
          <span className="mt-1 shrink-0 text-[var(--mi-tertiary)]" aria-hidden>
            ›
          </span>
        </div>

        {/* ── Progress ─────────────────────────────────────────────────── */}
        <div className="mt-3.5">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--mi-secondary)]">
              Documents
            </span>
            <span className="text-[0.75rem] font-semibold tabular-nums text-[var(--mi-secondary)]">
              {row.progressPercent}%
            </span>
          </div>
          <div
            className="mi-meter"
            role="progressbar"
            aria-valuenow={row.progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${row.driver.name} document completeness`}
          >
            <div className="mi-meter-fill" style={{ width: `${row.progressPercent}%` }} />
          </div>
        </div>

        {/* ── What is blocking, in words ───────────────────────────────── */}
        {outstanding > 0 && (
          <p className="mt-3 text-[0.8125rem] font-medium text-[var(--mi-warning)]">
            {outstanding} {outstanding === 1 ? "item needs" : "items need"} attention
            {awaitingDriver && " — waiting on the driver"}
            {!awaitingDriver && " — ready for you to check"}
          </p>
        )}

        {row.clearedToDrive && (
          <p className="mt-3 text-[0.8125rem] font-medium text-[var(--mi-success)]">
            All required documents approved
          </p>
        )}

        {/* ── Expiry warnings ───────────────────────────────────────────── */}
        {expiring > 0 && (
          <div className="mt-3 space-y-1 rounded-xl bg-[var(--mi-warning-bg)] px-3 py-2">
            {row.expiringSoon.slice(0, 3).map((e) => (
              <p key={e.checkId} className="text-[0.75rem] font-medium text-[var(--mi-warning)]">
                {e.label} expires {relativeDays(e.validUntil)}
              </p>
            ))}
            {expiring > 3 && (
              <p className="text-[0.75rem] font-medium text-[var(--mi-warning)]">
                +{expiring - 3} more expiring
              </p>
            )}
          </div>
        )}

        {/* ── Footnotes: policy version + last reviewer ─────────────────── */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--mi-separator)] pt-2.5 text-[0.6875rem] text-[var(--mi-tertiary)]">
          <span>Policy {row.acceptedPolicyVersion ?? "—"}</span>
          {row.submittedAt && <span>Submitted {fmtDate(row.submittedAt)}</span>}
          {row.reviewedBy && <span>Last: {row.reviewedBy}</span>}
          {!row.submittedAt && awaitingDriver && <span>Not submitted yet</span>}
        </div>
      </div>
    </button>
  );
}

/** Small helper reused by the review sheet for the same pill treatment. */
export function StatusPill({ status }: { status: string }) {
  const pill = STATUS_PILL[status] ?? STATUS_PILL.missing;
  return (
    <span className={cn("mi-pill")} style={{ background: pill.bg, color: pill.fg }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function ConfidenceTag({ confidence }: { confidence: string }) {
  const c = CONFIDENCE_LABEL[confidence] ?? CONFIDENCE_LABEL.likely;
  return (
    <span className="mi-pill" style={{ background: c.bg, color: c.fg }} title={c.text}>
      {c.text}
    </span>
  );
}
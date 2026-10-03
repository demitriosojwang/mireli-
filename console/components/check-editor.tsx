"use client";

import type { PendingReview } from "@/lib/api";
import { ConfidenceTag } from "@/components/driver-card";

/**
 * The per-document decision form.
 *
 * Shows the requirement's own guidance — what it is, who issues it, why we
 * require it, and the legal source — because a compliance officer should not
 * have to remember the rules, and should be able to see which ones are still
 * provisional. That transparency matters: this is a decision someone may have to
 * defend to NTSA or to a driver's lawyer months later.
 */

export function CheckEditor({
  check,
  decision,
  setDecision,
  reason,
  setReason,
  validUntil,
  setValidUntil,
  busy,
  onBack,
  onSubmit,
}: {
  check: PendingReview;
  decision: "approved" | "rejected" | null;
  setDecision: (d: "approved" | "rejected") => void;
  reason: string;
  setReason: (r: string) => void;
  validUntil: string;
  setValidUntil: (v: string) => void;
  busy: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  // A rejection without a reason is blocked here AND server-side. Telling the
  // reviewer now is kinder than a 400 with a code they have to decode.
  const needsReason = decision === "rejected" && reason.trim().length === 0;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="mi-sub text-[var(--mi-info)]">
        &lsaquo; Back to the driver
      </button>

      <div className="mi-group p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mi-title">{check.label}</h3>
          <ConfidenceTag confidence={check.confidence} />
        </div>
        <p className="mi-sub mt-1">{check.description}</p>
        <dl className="mt-3 space-y-1.5 text-[0.8125rem]">
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-[var(--mi-secondary)]">Issued by</dt>
            <dd className="font-medium">{check.issuingAuthority}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-[var(--mi-secondary)]">Why</dt>
            <dd className="text-[var(--mi-label-2)]">{check.rationale}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-[var(--mi-secondary)]">Source</dt>
            <dd className="text-[var(--mi-tertiary)]">{check.source}</dd>
          </div>
        </dl>
      </div>

      <div>
        <p className="mi-section-header">Your decision</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setDecision("approved")}
            aria-pressed={decision === "approved"}
            className={`mi-btn ${decision === "approved" ? "mi-btn-primary" : "mi-btn-quiet"}`}
          >
            &#10003; Approve
          </button>
          <button
            onClick={() => setDecision("rejected")}
            aria-pressed={decision === "rejected"}
            className={`mi-btn ${decision === "rejected" ? "mi-btn-danger" : "mi-btn-quiet"}`}
          >
            &#10005; Reject
          </button>
        </div>
      </div>

      {decision === "approved" && (
        <div>
          <label className="mi-section-header block" htmlFor="validUntil">
            Valid until
          </label>
          <input
            id="validUntil"
            type="date"
            className="mi-input"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
          <p className="mi-sub mt-1.5">
            Pre-filled from the standard validity. Shorten it if needed &mdash; for
            example accepting insurance for six months pending annual renewal.
          </p>
        </div>
      )}

      <div>
        <label className="mi-section-header block" htmlFor="reason">
          {decision === "rejected" ? "Reason (required)" : "Note (optional)"}
        </label>
        <textarea
          id="reason"
          className="mi-input min-h-[88px] resize-y"
          placeholder={
            decision === "rejected"
              ? "What must the driver fix? They will see this."
              : "Anything worth recording"
          }
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={needsReason}
        />
        {needsReason && (
          <p className="mt-1.5 text-[0.75rem] font-medium text-[var(--mi-danger)]">
            A rejection without a reason cannot be acted on by the driver.
          </p>
        )}
      </div>

      <button
        className="mi-btn mi-btn-primary w-full"
        disabled={decision === null || needsReason || busy}
        onClick={onSubmit}
      >
        {busy
          ? "Saving\u2026"
          : decision === "rejected"
            ? "Reject document"
            : "Approve document"}
      </button>
    </div>
  );
}
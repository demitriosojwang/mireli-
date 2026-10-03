"use client";

import { useEffect, useMemo, useState } from "react";
import { api, ApiError, type OnboardingRow, type PendingReview } from "@/lib/api";
import { StatusPill } from "@/components/driver-card";
import { CheckEditor } from "@/components/check-editor";
import { RejectButton } from "@/components/reject-button";
import { fmtDate, relativeDays } from "@/lib/utils";

/**
 * The review sheet: where a document is approved or rejected, and where a
 * driver is finally cleared to drive.
 *
 * Behaviour that matters for compliance, not just for looks:
 *  · A reason is REQUIRED to reject, suspend or refuse — the driver sees it.
 *  · Approving prefills the expiry from the requirement's own validity, so the
 *    reviewer confirms a known number instead of typing a date and getting it
 *    wrong. It stays editable; compliance often imposes a SHORTER window.
 *  · Approval is blocked while anything is outstanding: client-side for
 *    clarity, server-side for safety.
 */
export function ReviewSheet({
  row,
  onClose,
  onDone,
  onError,
}: {
  row: OnboardingRow;
  onClose: () => void;
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<PendingReview | null>(null);
  const [validUntil, setValidUntil] = useState("");
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);

  // Escape closes, as in any native sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openCheck = (c: PendingReview) => {
    setSelected(c);
    setDecision(null);
    setReason("");
    setValidUntil(
      c.suggestedValidityDays
        ? defaultExpiry(c.suggestedValidityDays)
        : c.validUntil
          ? c.validUntil.slice(0, 10)
          : ""
    );
  };

  const outstanding = useMemo(
    () => row.checks.filter((c) => c.blocking && c.state !== "approved").length,
    [row.checks]
  );

  async function act(body: Record<string, unknown>, key: string, ok: string) {
    setBusy(key);
    try {
      await api.post("/api/admin/onboarding", { onboardingId: row.onboardingId, ...body });
      onDone(ok);
    } catch (e) {
      if (e instanceof ApiError && e.code === "STALE_ONBOARDING") {
        onError("Someone else updated this application. Close and reopen it.");
      } else if (e instanceof ApiError && e.code === "OUTSTANDING_DOCUMENTS") {
        onError("Some documents are still outstanding. Finish those first.");
const body = selected ? (
    <CheckEditor
      check={selected}
      decision={decision}
      setDecision={setDecision}
      reason={reason}
      setReason={setReason}
      validUntil={validUntil}
      setValidUntil={setValidUntil}
      busy={busy !== null}
      onBack={() => setSelected(null)}
      onSubmit={() =>
        act(
          {
            action: "review_check",
            checkId: selected.checkId,
            decision,
            reason: reason || undefined,
            validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
            expectedVersion: row.version,
          },
          `check-${selected.checkId}`,
          `${selected.label} ${decision}`
        )
      }
    />
  ) : (
    <div className="space-y-5">
      {row.pendingReview.length > 0 && (
        <section>
          <p className="mi-section-header">Needs your decision</p>
          <div className="mi-group">
            {row.pendingReview.map((c) => (
              <button key={c.checkId} onClick={() => openCheck(c)} className="mi-row">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[0.9375rem] font-semibold">{c.label}</span>
                    {c.blocking && (
                      <span
                        className="mi-pill"
                        style={{ background: "var(--mi-danger-bg)", color: "var(--mi-danger)" }}
                      >
                        Required
                      </span>
                    )}
                  </div>
                  <p className="mi-sub mt-0.5 truncate">{c.issuingAuthority}</p>
                </div>
                <span className="shrink-0 text-[var(--mi-tertiary)]" aria-hidden>
                  &rsaquo;
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="mi-section-header">All requirements</p>
        <div className="mi-group">
          {row.checks.map((c) => (
            <div key={c.checkId} className="mi-row">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.9375rem] font-medium">{c.label}</p>
                <p className="mi-sub mt-0.5 truncate">
                  {c.validUntil
                    ? `Valid until ${fmtDate(c.validUntil)} (${relativeDays(c.validUntil)})`
                    : "Permanent"}
                </p>
              </div>
              <StatusPill status={c.state} />
            </div>
          ))}
        </div>
      </section>

      {row.history.length > 0 && (
        <section>
          <p className="mi-section-header">History</p>
          <div className="mi-group px-4 py-3">
            <ul className="space-y-2">
              {row.history.slice(0, 8).map((h) => (
                <li key={h.id} className="text-[0.75rem] text-[var(--mi-secondary)]">
                  <span className="font-semibold">{h.type.replace(/_/g, " ")}</span>
                  {" · "}
                  {fmtDate(h.createdAt)}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
      } else {
        onError(e instanceof Error ? e.message : "Something went wrong");
      }
    } finally {
      setBusy(null);
    }
  }
return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Review ${row.driver.name}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-[var(--mi-canvas)] shadow-[var(--mi-shadow-lg)] sm:rounded-[28px]"
      >
        <div className="shrink-0 border-b border-[var(--mi-separator)] bg-[var(--mi-surface)] px-5 pb-4 pt-3">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--mi-separator)] sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="mi-title truncate">{row.driver.name}</h2>
              <p className="mi-sub truncate">
                {row.driver.plate} &middot; {row.driver.phone}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--mi-fill)] text-[var(--mi-secondary)]"
            >
              &times;
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill status={row.status} />
            {row.reviewNotes && (
              <span className="text-[0.75rem] text-[var(--mi-secondary)]">{row.reviewNotes}</span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">{body}</div>

        {!selected && (
          <div className="shrink-0 space-y-2 border-t border-[var(--mi-separator)] bg-[var(--mi-surface)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              className="mi-btn mi-btn-primary w-full"
              disabled={busy !== null || outstanding > 0 || row.status === "approved"}
              onClick={() =>
                act(
                  { action: "approve", expectedVersion: row.version },
                  "approve",
                  `${row.driver.name} cleared to drive`
                )
              }
            >
              {busy === "approve"
                ? "Approving\u2026"
                : outstanding > 0
                  ? `${outstanding} requirement${outstanding === 1 ? "" : "s"} outstanding`
                  : "Approve driver"}
            </button>
            <div className="flex gap-2">
              <button
                className="mi-btn mi-btn-quiet flex-1"
                disabled={busy !== null}
                onClick={() =>
                  act({ action: "remind", expectedVersion: row.version }, "remind", "Reminder sent")
                }
              >
                Remind driver
              </button>
              <RejectButton row={row} busy={busy !== null} act={act} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Today + N days, as an ISO date string for a date input. */
function defaultExpiry(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
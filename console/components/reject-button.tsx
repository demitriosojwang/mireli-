"use client";

import { useState } from "react";
import type { OnboardingRow } from "@/lib/api";

/**
 * Reject / suspend, behind a confirm step that REQUIRES a reason.
 *
 * Suspend is for an already-approved driver (documents lapsed, conduct issue);
 * reject for one still in application. Suspending also revokes sessions
 * server-side, so the driver's app stops working immediately rather than
 * continuing to serve cached data.
 */
export function RejectButton({
  row,
  busy,
  act,
}: {
  row: OnboardingRow;
  busy: boolean;
  act: (body: Record<string, unknown>, key: string, ok: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const isApproved = row.status === "approved";
  const action = isApproved ? "suspend" : "reject";

  if (!open) {
    return (
      <button className="mi-btn mi-btn-quiet flex-1" onClick={() => setOpen(true)}>
        {isApproved ? "Suspend" : "Reject"}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center sm:p-6">
      <div
        className="w-full max-w-md rounded-t-[28px] bg-[var(--mi-surface)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--mi-shadow-lg)] sm:rounded-[28px]"
        role="dialog"
        aria-modal="true"
        aria-label={isApproved ? "Suspend driver" : "Reject application"}
      >
        <h3 className="mi-title">
          {isApproved ? `Suspend ${row.driver.name}?` : `Reject ${row.driver.name}?`}
        </h3>
        <p className="mi-sub mt-1">
          {isApproved
            ? "Their sessions end immediately and they stop receiving work. They will see your reason."
            : "They will be told why, and can fix it and apply again."}
        </p>
        <textarea
          className="mi-input mt-3 min-h-[88px] resize-y"
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="mt-3 flex gap-2">
          <button className="mi-btn mi-btn-quiet flex-1" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            className="mi-btn mi-btn-danger flex-1"
            disabled={reason.trim().length === 0 || busy}
            onClick={() =>
              act(
                { action, reason, expectedVersion: row.version },
                action,
                isApproved ? "Driver suspended" : "Application rejected"
              )
            }
          >
            {isApproved ? "Suspend" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
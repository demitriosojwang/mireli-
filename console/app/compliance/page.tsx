"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DriverCard } from "@/components/driver-card";
import { ReviewSheet } from "@/components/review-sheet";
import { api, ApiError, type OnboardingRow, type QueueResponse } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The compliance review queue — the page that actually clears drivers to drive.
 *
 * Following the master plan's rule that sensitive document access is restricted
 * and every override is attributable:
 *  · One driver per card. Never a table — a reviewer scans faces and states,
 *    not row identifiers.
 *  · Outstanding work is stated in words ("3 documents need checking"), not
 *    implied by a percentage alone.
 *  · Approve is disabled while anything is outstanding. The button is not the
 *    safety net — the server refuses regardless — but a disabled control tells
 *    the reviewer WHY before they tap and get a 409.
 */

type Filter = "pending" | "expiring" | "approved" | "all";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "pending", label: "Needs action" },
  { key: "expiring", label: "Expiring" },
  { key: "approved", label: "Approved" },
  { key: "all", label: "All" },
];

export default function ComplianceQueue() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OnboardingRow | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    try {
      const res = await api.get<QueueResponse>(`/api/admin/onboarding?filter=${f}`);
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const flash = useCallback((tone: "ok" | "bad", text: string) => {
    setToast({ tone, text });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const rows = data?.onboardings ?? [];
return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-5 lg:max-w-4xl lg:px-8 lg:py-8">
        {counts && (
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Count label="To review" value={counts.documentsToReview} tone="info" />
            <Count label="With drivers" value={counts.awaitingDriver} tone="warning" />
            <Count label="Approved" value={counts.approved} tone="good" />
            <Count label="Suspended" value={counts.suspended} tone="bad" />
            <Count label="In review" value={counts.awaitingCompliance} tone="info" />
          </div>
        )}

        {/* Horizontally scrollable filter pills — the iOS segmented idiom. */}
        <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors",
                filter === f.key
                  ? "bg-[var(--mi-navy)] text-white"
                  : "bg-[var(--mi-surface)] text-[var(--mi-label-2)] shadow-[var(--mi-shadow-sm)]"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          className="mi-input mb-5"
          placeholder="Search name, phone or plate"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search drivers"
        />

        {loading && <p className="mi-sub px-1">Loading…</p>}

        {!loading && error && (
          <div className="mi-group p-4">
            <p className="mi-title text-[var(--mi-danger)]">{error}</p>
            <button className="mi-btn mi-btn-quiet mt-3" onClick={() => void load(filter)}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="mi-group px-4 py-12 text-center">
            <p className="mi-title">Nothing here</p>
            <p className="mi-sub mt-1">
              {query ? "No driver matches that search." : "No drivers in this queue."}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {visible.map((row) => (
            <DriverCard key={row.onboardingId} row={row} onOpen={() => setOpen(row)} />
          ))}
        </div>
      </div>

      {open && (
        <ReviewSheet
          row={open}
          onClose={() => setOpen(null)}
          onDone={(msg) => {
            flash("ok", msg);
            setOpen(null);
            void load(filter);
          }}
          onError={(msg) => flash("bad", msg)}
        />
      )}

      {/* Announced to assistive tech, and shown visually. */}
      <div aria-live="polite" className="sr-only">
        {toast?.text}
      </div>
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 lg:bottom-8">
          <div
            className={cn(
              "pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-[0.875rem] font-medium shadow-[var(--mi-shadow-lg)]",
              toast.tone === "ok"
                ? "bg-[var(--mi-success)] text-white"
                : "bg-[var(--mi-danger)] text-white"
            )}
          >
            {toast.text}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "good" | "warn" | "bad" | "info";
}) {
  const map = {
    good: "var(--mi-success)",
    warn: "var(--mi-warning)",
    bad: "var(--mi-danger)",
    info: "var(--mi-info)",
  } as const;
  return (
    <div className="mi-group px-3 py-2.5">
      <div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-[var(--mi-secondary)]">
        {label}
      </div>
      <div className="mt-0.5 text-[1.375rem] font-bold tabular-nums" style={{ color: map[tone] }}>
        {value}
      </div>
    </div>
  );
}
  const counts = data?.counts;

  // Client-side search: the queue is small, and a round trip per keystroke
  // would put driver names into server logs unnecessarily.
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.driver.name.toLowerCase().includes(q) ||
        r.driver.phone.toLowerCase().includes(q) ||
        r.driver.plate.toLowerCase().includes(q)
    );
  }, [rows, query]);
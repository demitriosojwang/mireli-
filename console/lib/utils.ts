import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Status → pill styling. Every caller MUST render a word alongside the pill;
 * the colour is redundant reinforcement, never the only signal. That matters
 * for colour-blind staff and for a compliance officer squinting at a phone in
 * Mombasa sunlight.
 */
export const STATUS_PILL: Record<string, { bg: string; fg: string }> = {
  // Onboarding lifecycle
  not_started: { bg: "var(--mi-fill)", fg: "var(--mi-secondary)" },
  applied: { bg: "var(--mi-info-bg)", fg: "var(--mi-info)" },
  under_review: { bg: "var(--mi-warning-bg)", fg: "var(--mi-warning)" },
  approved: { bg: "var(--mi-success-bg)", fg: "var(--mi-success)" },
  rejected: { bg: "var(--mi-danger-bg)", fg: "var(--mi-danger)" },
  suspended: { bg: "var(--mi-danger-bg)", fg: "var(--mi-danger)" },
  withdrawn: { bg: "var(--mi-fill)", fg: "var(--mi-secondary)" },

  // Per-document states
  missing: { bg: "var(--mi-fill)", fg: "var(--mi-secondary)" },
  uploaded: { bg: "var(--mi-info-bg)", fg: "var(--mi-info)" },
  in_review: { bg: "var(--mi-warning-bg)", fg: "var(--mi-warning)" },
  expired: { bg: "var(--mi-danger-bg)", fg: "var(--mi-danger)" },
  pending: { bg: "var(--mi-warning-bg)", fg: "var(--mi-warning)" },

  // Ride offers
  offered: { bg: "var(--mi-info-bg)", fg: "var(--mi-info)" },
  accepted: { bg: "var(--mi-success-bg)", fg: "var(--mi-success)" },
  declined: { bg: "var(--mi-fill)", fg: "var(--mi-secondary)" },

  // Driver account
  active: { bg: "var(--mi-success-bg)", fg: "var(--mi-success)" },
  inactive: { bg: "var(--mi-fill)", fg: "var(--mi-secondary)" },
};

/** Human wording for each status. Never show a raw enum to a reviewer. */
export const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  applied: "Applied",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
  withdrawn: "Withdrawn",
  missing: "Not uploaded",
  uploaded: "Awaiting review",
  in_review: "Being checked",
  expired: "Expired",
  pending: "Pending",
  offered: "Open",
  accepted: "Accepted",
  declined: "Declined",
  active: "Active",
  inactive: "Inactive",
};

/**
 * How confident the legal sourcing is for a requirement. Shown so a reviewer
 * knows which verdicts rest on gazetted text and which are provisional. An
 * onboarding list that is confidently wrong is worse than one that is visibly
 * provisional, because the business will defend it in front of NTSA.
 */
export const CONFIDENCE_LABEL: Record<string, { text: string; bg: string; fg: string }> = {
  confirmed: { text: "Confirmed", bg: "var(--mi-success-bg)", fg: "var(--mi-success)" },
  likely: { text: "Verify", bg: "var(--mi-warning-bg)", fg: "var(--mi-warning)" },
  gap: { text: "Added — gap", bg: "var(--mi-info-bg)", fg: "var(--mi-info)" },
};

/** 12-hour clock + short date. Unambiguous, and matches how Kenyan ops talk. */
export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

/** "in 12 days" / "3 days ago" — how a reviewer actually thinks about expiry. */
export function relativeDays(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  if (days === -1) return "yesterday";
  return `${Math.abs(days)} days ago`;
}

export function ksh(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `KSh ${n.toLocaleString("en-KE")}`;
}
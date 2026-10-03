"use client";

/**
 * API client for the compliance console.
 *
 * Auth reuses the existing Mireli Web admin cookie session rather than
 * introducing a second identity system. `credentials: "include"` is what makes
 * that work — without it the browser silently drops the admin cookie and every
 * call returns 401, which looks like a broken console rather than a broken
 * session.
 *
 * Every non-2xx throws with the backend's stable `code` attached, so a caller
 * can react specifically: `OUTSTANDING_DOCUMENTS` means "refresh and finish the
 * reviews", `STALE_ONBOARDING` means "another officer got there first". Neither
 * should collapse into a generic toast.
 */

export class ApiError extends Error {
  code: string | undefined;
  status: number;
  /** Document-level detail, e.g. which checks are still outstanding. */
  payload: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code?: string,
    payload: Record<string, unknown> = {}
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    credentials: "include",
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // A non-JSON body (proxy error page, gateway timeout) is still a failure;
    // it must not read as an empty success.
    if (!res.ok) {
      throw new ApiError(
        `Request failed (${res.status})`,
        res.status
      );
    }
  }

  if (!res.ok) {
    throw new ApiError(
      (data.error as string) || `Request failed (${res.status})`,
      res.status,
      data.code as string | undefined,
      data
    );
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body }),
};

// ─── Wire types (mirroring the backend) ─────────────────────────────────────

export interface RequirementCheck {
  checkId: string;
  docType: string;
  label: string;
  state: string;
  blocking: boolean;
  validUntil: string | null;
  note: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface PendingReview extends RequirementCheck {
  description: string;
  issuingAuthority: string;
  /** From the requirement catalogue — lets a reviewer prefill the expiry. */
  suggestedValidityDays: number | null;
  confidence: string;
  rationale: string;
  source: string;
}

export interface DriverSummary {
  id: string;
  name: string;
  phone: string;
  plate: string;
  cabType: string;
  capacity: number;
  status: string;
  statusReason: string | null;
}

export interface OnboardingRow {
  onboardingId: string;
  status: string;
  version: number;
  awaitingOn: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  acceptedPolicyVersion: string | null;
  driver: DriverSummary;
  progressPercent: number;
  clearedToDrive: boolean;
  blockers: string[];
  advisories: string[];
  pendingReview: PendingReview[];
  expiringSoon: Array<{ checkId: string; docType: string; label: string; validUntil: string; daysLeft: number }>;
  checks: RequirementCheck[];
  history: Array<{
    id: string;
    type: string;
    actorRole: string | null;
    actorId: string | null;
    detail: string | null;
    createdAt: string;
  }>;
}

export interface QueueCounts {
  awaitingDriver: number;
  awaitingCompliance: number;
  approved: number;
  suspended: number;
  documentsToReview: number;
}

export interface QueueResponse {
  onboardings: OnboardingRow[];
  counts: QueueCounts;
  serverTime: string;
}
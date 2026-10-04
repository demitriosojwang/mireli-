/**
 * The requirement catalogue: what a driver must have before carrying Mi-Reli
 * passengers.
 *
 * This is the SINGLE definition. The API, the admin console and the app all read
 * it, so there is exactly one list rather than three that drift apart during an
 * inspection.
 *
 * ── Sourcing and confidence ────────────────────────────────────────────────
 * Each requirement is tagged with how confident we are. This matters: an
 * onboarding list that is confidently wrong is more dangerous than one that is
 * visibly provisional, because the business will defend it in front of NTSA.
 *
 * CONFIRMED - read from the gazetted text or the issuing authority's own
 *             published procedure during the research session.
 * LIKELY    - consistent across several secondary sources, but the gazetted
 *             text was not retrieved in full. VERIFY with counsel.
 *
 * Two corrections to the original seven-document list are baked in:
 *   - The NTSA PSV driver badge is valid for TWO years, not one. Encoding the
 *     wrong validity would expire every badge a year early and cost real money.
 *   - A speed-governor calibration certificate and a vehicle PSV licence are
 *     separate mandatory documents, NOT implied by the inspection sticker.
 */

/** How much we trust a requirement. Surfaced in the admin console. */
export type Confidence = "confirmed" | "likely";

export interface RequirementDef {
  /** Matches `DriverDocument.type` and `OnboardingCheck.docType`. */
  type: string;
  label: string;
  /** Shown to the driver - must be specific about what to bring. */
  description: string;
  issuingAuthority: string;
  /** Validity in days; null means permanent / no expiry. */
  validityDays: number | null;
  confidence: Confidence;
  /** "all" = every driver. Narrower values are conditionally required. */
  requiredFor: "all" | "vehicle_over_3048kg";
  /** Whether a failure blocks the driver from taking work. */
  blocking: boolean;
  /** Why this exists - shown to compliance, not the driver. */
  rationale: string;
  /** Legal source, for the compliance register. */
  source: string;
}

/**
 * THE LIST. Order is the order a driver is asked for them in - identity first,
 * then the driver-licence chain, then the vehicle chain. Grouping matters: a
 * driver missing a licence and an insurance policy needs two different
 * conversations, and bundling them into one "documents pending" hides which
 * problem is which.
 */
export const DRIVER_REQUIREMENTS: RequirementDef[] = [
  {
    type: "national_id",
    label: "National ID or valid passport",
    description:
      "Front and back, all four corners visible. If you renewed your ID in the last two years, also bring the old one.",
    issuingAuthority: "Ministry of Interior / Immigration",
    validityDays: null,
    confidence: "confirmed",
    requiredFor: "all",
    blocking: true,
    rationale:
      "Legal identity and citizenship. Without it a driver is unidentifiable after an incident.",
    source: "Immigration Act; NTSA TIMS registration requires ID serial number",
  },
  {
    type: "driving_licence",
    label: "Kenyan driving licence (PSV class)",
    description: "Both sides of the card. The class must cover the vehicle you will drive.",
    issuingAuthority: "NTSA",
    validityDays: 365 * 3,
    confidence: "confirmed",
    requiredFor: "all",
    blocking: true,
    rationale:
      "Statutory authority to drive. The PSV endorsement is what distinguishes this from an ordinary private licence.",
    source: "Traffic Act; NTSA PSV Operations Regulations",
  },
  {
    type: "psv_badge",
    label: "NTSA PSV driver badge",
    description:
      "The badge card itself, plus the TIMS reference printed on it. Renew a month before expiry.",
    issuingAuthority: "NTSA (TIMS / eCitizen)",
    // CORRECTION to the owner's original list, which said 1 year. NTSA's own
    // published procedure states two years.
    validityDays: 365 * 2,
    confidence: "likely",
    requiredFor: "all",
    blocking: true,
    rationale:
      "The statutory licence to carry paying passengers. Driving without it is an offence, and it exposes both the driver and the operator.",
    source:
      "NTSA published PSV badge procedure (2-year validity) - VERIFY against the current gazetted instrument",
  },
  {
    type: "good_conduct",
    label: "Certificate of good conduct",
    description:
      "DCI-issued, applied for on eCitizen. Bring the printed certificate, not just the application receipt.",
    issuingAuthority: "Directorate of Criminal Investigations (DCI)",
    validityDays: 365,
    confidence: "confirmed",
    requiredFor: "all",
    blocking: true,
    rationale:
      "Criminal-record screen. A passenger-safety control as much as a legal one, and insurers may ask.",
    source: "Criminal Investigation Act; required for NTSA PSV badge application",
  },
  {
    type: "kra_pin",
    label: "KRA PIN",
    description: "Your personal KRA PIN. NTSA requires it to complete PSV badge registration.",
    issuingAuthority: "Kenya Revenue Authority",
    validityDays: null,
    confidence: "confirmed",
    requiredFor: "all",
    blocking: true,
    rationale: "Tax compliance, and a prerequisite of the PSV badge application itself.",
    source: "NTSA TIMS registration requires KRA PIN; Income Tax Act",
  },
  {
{
    type: "inspection_sticker",
    label: "NTSA inspection sticker / inspection report",
    description: "Current inspection for the year. The plate on the sticker must match your vehicle.",
    issuingAuthority: "NTSA Motor Vehicle Inspection",
    validityDays: 365,
    confidence: "likely",
    requiredFor: "all",
    blocking: true,
    rationale: "Roadworthiness: brakes, tyres, seatbelts, lights.",
    source: "Traffic Act; NTSA inspection programme - VERIFY current validity period",
  },
  {
    type: "speed_governor",
    label: "Speed governor calibration certificate",
    // NOT in the owner's original list of seven.
    description:
      "From an approved calibration centre. Required for every public service vehicle, separately from the inspection sticker.",
    issuingAuthority: "Approved calibration centre; device must be KBS-approved to KS 2295",
    validityDays: 365,
    confidence: "confirmed",
    requiredFor: "vehicle_over_3048kg",
    blocking: true,
    rationale:
      "Legal Notice 217 of 2013 requires speed governors on ALL public service vehicles conforming to KBS specifications. Inspectors ask for the calibration certificate separately, so 'inspection sticker' does not cover this.",
    source: "Traffic Act - Speed Governor Regulations, Legal Notice 217 of 2013",
  },
  {
    type: "psv_licence_plate",
    label: "Vehicle PSV licence / route permit",
    // NOT in the owner's original list, which covered only DRIVER documents.
    // This is the most likely thing an inspection would catch.
    description:
      "The vehicle's PSV licence. If a route permit is required for your operating area, bring it too.",
    issuingAuthority: "NTSA / Transport Service Controller",
    validityDays: 365,
    confidence: "likely",
    requiredFor: "all",
    blocking: true,
    rationale:
      "The VEHICLE, not just the driver, must be licensed for PSV operation. Operating an unlicensed PSV is an offence.",
    source: "NPSV Operations Regulations - vehicle licence requirement",
  },
  {
    type: "logbook",
    label: "Vehicle logbook (electronic or paper)",
    description:
      "The vehicle's e-logbook or current paper logbook. From June 2026 Kenya issues QR-verifiable electronic logbooks.",
    issuingAuthority: "NTSA (TIMS)",
    validityDays: null,
    confidence: "confirmed",
    requiredFor: "all",
    blocking: true,
    rationale:
      "Proof of vehicle custody and registration. NTSA began issuing QR-enabled e-logbooks on 10 June 2026 for registration, transfer, inspection and related services.",
    source: "NTSA e-logbook rollout notice, June 2026",
  },
  {
    type: "lease_agreement",
    label: "Certified lease or ownership agreement",
    description:
      "Certified by a Commissioner for Oaths if the vehicle is not registered to you personally.",
    issuingAuthority: "Commissioner for Oaths / NTSA",
    validityDays: null,
    confidence: "confirmed",
    requiredFor: "all",
    blocking: true,
    rationale:
      "Proof the driver is legally authorised to operate THIS vehicle. Without it an insurer can deny cover and the driver has no defence.",
    source: "NPSV Operations Regulations - operator/owner authority",
  },
  {
    type: "medical_fitness",
    label: "Medical fitness certificate",
    description:
      "From a recognised medical practitioner. Confirm with Mombasa County whether it is required on our routes.",
    issuingAuthority: "Recognised medical practitioner",
    validityDays: 365,
    confidence: "likely",
    requiredFor: "all",
    // NON-BLOCKING on purpose: a real passenger-safety control, but not
    // confirmed in the retrieved regulations. Making it a hard gate now would
    // block real drivers on an unverified rule.
    blocking: false,
    rationale:
      "Fatigue in a professional passenger driver is a safety risk. Tracked, but not yet enforced as a gate.",
    source: "Not confirmed in retrieved regulations - VERIFY with Mombasa County and counsel",
  },
/** The state of one requirement for one driver. */
export interface CheckState {
  type: string;
  label: string;
  description: string;
  issuingAuthority: string;
  confidence: Confidence;
  required: boolean;
  blocking: boolean;
  state: "missing" | "uploaded" | "in_review" | "approved" | "rejected" | "expired";
  validUntil: string | null;
  reason: string | null;
}

export interface EligibilityResult {
  /** ALL blocking requirements pass. This - not any stored flag - is the gate. */
  clearedToDrive: boolean;
  onboardingStatus: string;
  checks: CheckState[];
  /** Blocking items only, as driver-safe sentences. */
  blockers: string[];
  /** Non-blocking advisories (expiring soon, missing but not required). */
  advisories: string[];
  /** Percentage approved - drives the progress bar. */
  progressPercent: number;
  /** Who must act next: "waiting on you" vs "under review". */
  awaitingOn: "driver" | "compliance" | "none";
  policyVersion: string;
}

/** Days before expiry at which a driver is warned. */
const EXPIRY_WARNING_DAYS = 30;

/**
 * Compute whether a driver may take work, and exactly why not.
 *
 * Computed on every check rather than cached in a column, because the inputs
 * drift continuously: a document expires, a reviewer approves something, a
 * vehicle is swapped. A stored `approved` flag would be correct on the day it
 * was written and wrong the next morning.
 */
export function evaluateEligibility(params: {
  capacity: number | null;
  onboardingStatus: string | null;
  policyVersionAccepted: string | null;
  checks: Array<{
    docType: string;
    requiredFor: string;
    state: string;
    validUntil: Date | null;
    note: string | null;
  }>;
  now?: Date;
}): EligibilityResult {
  const now = params.now ?? new Date();
  const applicable = requirementsForDriver({ capacity: params.capacity });
  const byKey = new Map(params.checks.map((c) => [`${c.docType}:${c.requiredFor}`, c]));

  const checks: CheckState[] = [];
  const blockers: string[] = [];
  const advisories: string[] = [];
  let approvedCount = 0;

  for (const req of applicable) {
    const record = byKey.get(`${req.type}:${req.requiredFor}`);
    // An expired requirement fails the check even if it was once approved -
    // the single most important line in this function.
    const expired = !!record?.validUntil && record.validUntil < now;
    const effectiveState: CheckState["state"] =
      !record || record.state === "missing"
        ? "missing"
        : expired
          ? "expired"
          : (record.state as CheckState["state"]);

    const passes = effectiveState === "approved";
    if (passes) approvedCount++;

    const daysLeft = record?.validUntil
      ? Math.ceil((record.validUntil.getTime() - now.getTime()) / 86_400_000)
      : null;

    checks.push({
      type: req.type,
      label: req.label,
      description: req.description,
      issuingAuthority: req.issuingAuthority,
      confidence: req.confidence,
      required: true,
      blocking: req.blocking,
      state: effectiveState,
      validUntil: record?.validUntil ? record.validUntil.toISOString() : null,
      reason: record?.note ?? null,
    });

    if (!passes && req.blocking) {
      blockers.push(
        effectiveState === "rejected"
          ? `${req.label} was not accepted. ${record?.note ?? "Contact dispatch."}`
          : effectiveState === "expired"
            ? `${req.label} has expired.`
            : effectiveState === "uploaded" || effectiveState === "in_review"
              ? `${req.label} is being checked.`
              : `${req.label} is required.`
      );
    }

    // Warn BEFORE the date passes, so work does not stop the day it lapses.
    if (passes && daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS) {
      advisories.push(`${req.label} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`);
    }
  }

  // Non-blocking requirements still appear, but never stop the driver.
  const applicableTypes = new Set(applicable.map((r) => r.type));
  for (const req of DRIVER_REQUIREMENTS) {
    if (applicableTypes.has(req.type) || req.blocking) continue;
    const record = byKey.get(`${req.type}:${req.requiredFor}`);
    if (!record || record.state !== "missing") continue;
    advisories.push(`${req.label} is not yet on file.`);
  }

  const clearedToDrive = blockers.length === 0 && params.onboardingStatus === "approved";
  const pendingDriverAction = checks.some(
    (c) => c.blocking && (c.state === "missing" || c.state === "rejected")
  );
  const pendingCompliance = checks.some(
    (c) => c.state === "uploaded" || c.state === "in_review"
  );

  return {
    clearedToDrive,
    onboardingStatus: params.onboardingStatus ?? "applied",
    checks,
    blockers,
    advisories,
    progressPercent:
      applicable.length === 0 ? 0 : Math.round((approvedCount / applicable.length) * 100),
    awaitingOn: pendingDriverAction ? "driver" : pendingCompliance ? "compliance" : "none",
    policyVersion: params.policyVersionAccepted ?? ONBOARDING_POLICY_VERSION,
  };
}
];

/** Fast lookup by document type. */
export const REQUIREMENTS_BY_TYPE = new Map(
  DRIVER_REQUIREMENTS.map((r) => [r.type, r])
);

/**
 * Which requirements apply to this specific driver.
 *
 * Conditional requirements exist so the list is technically correct rather than
 * merely strict. Applying the governor rule to a light vehicle would be wrong,
 * and would teach drivers that our compliance list is arbitrary.
 */
export function requirementsForDriver(driver: { capacity?: number | null }): RequirementDef[] {
  // Mireli runs 7- and 14-seat shuttles, which sit in the class the governor rule
  // addresses, so the certificate is required for every active fleet vehicle.
  // If a sub-3048 kg vehicle is added, this is the single line to change.
  const requiresGovernor = (driver.capacity ?? 0) > 0;
  return DRIVER_REQUIREMENTS.filter(
    (r) => r.requiredFor === "all" || (r.requiredFor === "vehicle_over_3048kg" && requiresGovernor)
  );
}

/** The policy version a driver accepts at signup. Bump when the list changes. */
export const ONBOARDING_POLICY_VERSION = "v1";
    type: "psv_insurance",
    label: "PSV comprehensive insurance certificate",
    description:
      "Must explicitly cover commercial/passenger use. A private third-party policy is not acceptable.",
    issuingAuthority: "Registered Kenyan underwriter",
    validityDays: 365,
    confidence: "confirmed",
    requiredFor: "all",
    blocking: true,
    rationale:
      "Motor third-party property damage plus passenger bodily injury and death. An underinsured vehicle is a balance-sheet risk.",
    source: "Insurance (Motor Vehicle Third Party Risks) Act",
  },
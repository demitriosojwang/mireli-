# Driver Onboarding — Requirements, Gaps and Compliance

**Prepared:** 1 October 2026
**Scope:** Which documents and checks gate a driver onto Mireli Driver, and what
the original seven-document list missed.
**Status:** Requirements list implemented in code. The legal analysis is **not a
legal opinion** — items marked VERIFY must be settled with your Kenyan lawyer or
the authority before launch.

---

## 1. Your original list: what I changed and why

I researched each of your seven against gazetted text and issuing-authority
procedure pages. Three corrections and four additions.

### Corrections

| # | Your list said | I found | Why it matters |
|---|---|---|---|
| 3 | PSV badge valid **1 year** | NTSA's own published procedure states **2 years** | Encoding 1 year would expire every badge a year early and cost real money in needless renewals. I set `730` days and tagged it VERIFY. |
| 2 | Licence "1 or 3 Years" | Class-dependent; PSV endorsement is the qualifier | Storing a single flat validity hides which class is required. The check is per-driver. |
| 6 | Inspection sticker covers brakes, tyres, **speed governor**, seatbelts | The speed governor has its **own** legal instrument and its **own** certificate (LN 217/2013) | Treating the sticker as covering it is exactly the assumption an inspector would test. |

### Additions — these were missing

| # | Document | Issuing authority | Confidence | Why it's an exposure |
|---|---|---|---|---|
| 8 | **Speed governor calibration certificate** | Approved centre; KBS spec KS 2295 | Confirmed | Legal Notice 217/2013 requires a governor on **all** PSVs. Certificate is asked for separately from the sticker. |
| 9 | **Vehicle PSV licence / route permit** | NTSA / Transport Service Controller | Likely | Your list covered only *driver* documents. Operating an unlicensed **vehicle** is a separate offence under the PSV Operations Regulations. **This is the single most likely gap to be found in an inspection.** |
| 10 | **KRA PIN** | Kenya Revenue Authority | Confirmed | NTSA requires it to complete PSV badge registration at all. Without it the driver cannot complete the badge. |
| 11 | **Medical fitness certificate** | Recognised practitioner | Likely — **non-blocking** | Fatigue in a professional passenger driver is a safety risk, but I could not confirm it in the retrieved regulations. Tracked, not enforced. |

**On item 7 (logbook):** NTSA began issuing QR-verifiable **electronic** logbooks
on **10 June 2026**, phased in via registration, transfer, inspection and related
services, replacing paper. A paper logbook is now a legacy case. The field
accepts either, but your process should prefer the e-logbook.

---

## 2. The implemented requirement set

Defined once in `msafiri/src/lib/driver-onboarding.ts`. Eleven requirements,
each tagged with confidence:

| Type | Document | Validity | Blocking | Confidence |
|---|---|---|---|---|
| `national_id` | National ID / passport | permanent | yes | confirmed |
| `driving_licence` | PSV-class driving licence | 3 yr | yes | confirmed |
| `psv_badge` | NTSA PSV driver badge | **2 yr** | yes | likely — VERIFY |
| `good_conduct` | DCI certificate of good conduct | 12 mo | yes | confirmed |
| `kra_pin` | KRA PIN | permanent | yes | confirmed |
| `psv_insurance` | PSV comprehensive insurance | 12 mo | yes | confirmed |
| `inspection_sticker` | NTSA inspection sticker | 12 mo | yes | likely — VERIFY |
| `speed_governor` | Speed governor calibration cert | 12 mo | yes | confirmed |
| `logbook` | Vehicle logbook / e-logbook | permanent | yes | confirmed |
| `psv_licence_plate` | Vehicle PSV licence / route permit | 12 mo | yes | likely — VERIFY |
| `lease_agreement` | Certified lease / ownership | permanent | yes | confirmed |
| `medical_fitness` | Medical fitness certificate | 12 mo | **no** | likely — VERIFY |

`confidence` is deliberately visible in the data. A compliance list that is
confidently wrong is worse than one that is visibly provisional, because a
business will defend it in front of NTSA.

---

## 3. The three rules that shaped the implementation

**1. Document approved ≠ driver approved.** Seven perfect documents can still
leave a driver ineligible — a licence discovered revoked, a vehicle swapped for
one without a PSV licence. So `clearedToDrive` is **computed on every check**
from the approved set (`evaluateEligibility`), never stored in a boolean. A
cached flag would be right on the day it was written and wrong the next morning.

**2. An expired document blocks NEW work; it never cancels a running trip.** A
vehicle full of passengers does not become safer because an admin pressed a
button. Expiry gates the next assignment and raises a dispatch task.

**3. The driver supplies evidence; only compliance approves.** Uploading moves a
check to `uploaded`, never to `approved`. There is no code path in the driver
API that sets `approved`, extends an expiry, or changes onboarding status.

---

## 4. What I did NOT build, and why

| Not built | Reason |
|---|---|
| Automated verification against NTSA/eCitizen APIs | No public API exists for badge status. Compliance reviews by eye, as it must today. |
| OCR / document extraction | Adds a false-accept risk to a legal gate. A confident misread of a licence number is worse than a manual review. |
| Face matching against the ID photo | Separate biometric processing, separate DPIA, separate consent. Out of scope for the MVP. |
| Auto-expiry suspension job | Deliberate — see rule 2. The expiry *warning* job should exist; the suspension must be a human decision. |

**Storage is the one thing that is stubbed.** `POST /driver/onboarding/documents`
currently returns a **placeholder** PUT target. Before a single real driver
---

## 5. Two obligations that are about MIRELI, not the driver

Your list covers what a **driver** must present. Two obligations attach to the
**business**, and missing either is a larger exposure than any single missing
driver document.

**ODPC registration — mandatory, no small-business exemption.**
Under s.18 of the Data Protection Act 2019 and the Data Protection (Registration
of Data Controllers and Processors) Regulations 2021, **all** public and private
organisations and individuals processing personal data must register with the
Office of the Data Protection Commissioner. Registration opened 14 July 2022.
ODPC's own FAQ states entities "cannot act as Data Controllers or Data
Processors in Kenya unless they have registered".

> If Mireli's turnover is KSh 5M or less and it has under 50 staff, it falls in
> the "Micro and Small" band — **still required to register**, renewal fee
> KSh 2,000. Certificates are valid **24 months**; apply at least 30 days before
> expiry. Material changes must be notified within **14 days**.
> Source: https://www.odpc.go.ke/faqs/

Mireli processes drivers' national IDs, licences, biometrics-adjacent photos,
live location and passengers' data. Registration is not optional, and it is not
a driver-onboarding task — it belongs in the compliance register now.

**The DPIA lead time will block launch if ignored.**
Section 31(5) of the Data Protection Act requires a Data Protection Impact
Assessment to be submitted **60 days before** high-risk processing begins. Our
own location tracking and driver identity documents are plausibly high-risk. That
is a two-month lead time on launch day one, so it must start before the first
real passenger moves.

---

## 6. Open questions for your lawyer

| # | Question | Why it blocks |
|---|---|---|
| 1 | Is the PSV badge really 2 years, or has NTSA changed it? | Sets every renewal reminder. A wrong answer either expires drivers early or lets lapsed badges run. |
| 2 | Is the vehicle PSV licence / route permit required for our shuttle routes, and does Mombasa County add its own? | The biggest gap in the original list. |
| 3 | Is medical fitness mandatory on our routes? | Currently non-blocking. If mandatory, it becomes a hard gate and we will be blocking drivers on a rule we never enforced. |
| 4 | Does the charter subscription make a driver an employee, agent or contractor? | Decides commission model, and whether the 18% cap applies. |
| 5 | What record-retention period applies to driver ID copies? | Directly sets the deletion job's behaviour. |
| 6 | Who at Mireli is authorised to approve a driver? | Determines who gets the compliance role, and whether approvals need a second reviewer. |

---

## 7. Sources

Retrieved during this research session:

- **PSV Operations Regulations, Legal Notice 23 of 2014** (rev. 31 Dec 2022) — vehicle
  licensing, operator duties, offences. https://new.kenyalaw.org/akn/ke/act/ln/2014/23/eng@2022-12-31
- **Speed Governor Regulations, Legal Notice 217 of 2013** — governors required on all
  PSVs to KBS spec KS 2295. https://new.kenyalaw.org/akn/ke/act/ln/2013/217/eng@2022-12-31
- **NTSA PSV driver badge procedure** — required documents, KRA PIN, 2-year validity,
  fee KSh 1,000. https://www.wikiprocedure.com/index.php/Kenya_-_Apply_for_a_Driver_Public_Service_Vehicle_(PSV)_Badge
- **NTSA e-logbook rollout, June 2026** — electronic logbooks from 10 June 2026.
- **ODPC registration FAQs** — mandatory registration, no micro/small exemption,
  24-month validity, 14-day change notification.
  https://www.odpc.go.ke/faqs/

**Could not retrieve in full — treat as outstanding:**

- **Legal Notice 120 of 2022** (TNC Regulations) — the fetch timed out. This is
  the instrument most directly about app-mediated transport and the one that
  most affects whether Mireli's model is compliant. **Retrieve and read this
  before launch.**
- **ODPC Transport Sector Guidance Note** — the PDF returned binary content that
  could not be parsed. It is the sector-specific guidance referenced in the
  master plan; retrieve and read it directly.
uploads a national ID, wire it to signed-URL generation in private object
storage and **confirm the bucket blocks public access**. A driver's ID and
certificate of good conduct are among the most sensitive documents a Kenyan
citizen holds.
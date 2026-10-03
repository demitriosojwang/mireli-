# API Contract — Mireli Driver ↔ Mireli Web

Base URL: `https://<mireli-host>/api/driver`
*(Routes are unversioned for the MVP — add `/v1` before any breaking change.)*

**Auth:** every route except `POST /driver/auth` requires
`Authorization: Bearer <driver_token>`.

**Why not the web's cookies:** Mireli Web uses HMAC-signed httpOnly cookies
because a browser can hold one. An Android app needs a bearer token it can
attach per request, rotate, and revoke **per device** — otherwise a lost phone
is an unrecoverable account takeover. The raw token is never stored; only its
SHA-256. A driver session can never act against passenger or admin routes.

---

## Error envelope

Every non-2xx returns a stable `code` so the app reacts specifically instead of
showing "something went wrong":

```json
{ "error": "This trip changed. Refresh to see the latest details.",
  "code": "STALE_ASSIGNMENT",
  "currentVersion": 4,
  "assignmentState": "withdrawn" }
```

| Code | Status | App behaviour |
|---|---|---|
| `STALE_ASSIGNMENT` | 409 | Refresh; show the new state |
| `WITHDRAWN` / `EXPIRED` | 409 | Stop showing accept/decline; explain why |
| `NOT_ELIGIBLE` | 403 | Route to Documents; name the problem |
| `MISSING_ACTION_ID` | 400 | **App bug** — retry with a fresh id |
| `ALREADY_FULLY_BOARDED` | 409 | Show "already recorded"; do not re-board |
| `NOT_ON_TRIP` / `BOOKING_CANCELLED` | 404 / 409 | Tell the driver to call dispatch |
| `TRIP_CLOSED` | 409 | Trip already completed/cancelled |

---

## Endpoints

### `POST /driver/auth`

Three steps: `request` → `verify` → `logout`.

```jsonc
// request — SAME shape for unknown numbers (anti-enumeration)
{ "step": "request", "phone": "0712345678" }
→ { "ok": true, "cooldownSeconds": 30 }

// verify
{ "step": "verify", "phone": "0712345678", "code": "1234",
  "deviceId": "<install-uuid>", "appVersion": "1.0.0" }
→ { "ok": true, "token": "...", "expiresAt": "...", "driver": {...} }
```

`verify` returns the **same generic error** for a wrong code and for an unknown
driver. A verified phone proves control of a number — never that the person is
licensed to carry passengers; that comes from `status` and document checks,
re-evaluated on every request.

---

### `GET /driver/me` · `POST /driver/me`

Profile, eligibility, documents, subscription, notices, and the derived **rides**
counters. No parameter can widen this to another driver.

`documents` expose **review state and expiry only — never a file URL.**

`POST { "available": true }` is an **intent, not an assignment**: the ops engine
decides what a driver actually gets. Refused with `403` + the eligibility payload
while documents are invalid.

---

### `GET /driver/assignments`

```jsonc
{
  "assignments": [ {
    "tripId": "...",
    "assignmentState": "pending",   // pending|accepted|declined|withdrawn|expired
    "assignmentVersion": 3,
    "train": { "name": "Express", "mtmTime": "20:30", "eventKind": "arrives_mtm" },
    "routeName": "Mombasa → Likoni", "serviceType": "shared",
    "departureAt": "...", "reportAt": "...", "tripStatus": "locked",
    "expectedSeats": 7, "bookings": 3, "capacity": 13,
    "minutesUntilReport": 45,       // negative = deadline already passed
    "isImminent": true
  } ],
  "actionable": { /* the one thing to do next */ },
  "commissionRatePercent": 15
}
```

**Why `reportAt` is separate from `departureAt`:** an SGR-linked transfer has
three distinct times — the train event, when the driver must report, and when
the vehicle leaves. Collapsing them is how a driver waits an hour early, or
leaves after the train has gone.

### `POST /driver/assignments`

```jsonc
---

### `GET /driver/assignments/{tripId}/manifest`

```jsonc
{
  "tripId": "...", "routeName": "...", "direction": "FROM_TERMINUS",
  "pointsLabel": "drop-off",        // drop-off|pickup — depends on direction
  "stops": [ { "id", "name", "order", "lat", "lng" } ],
  "vehicle": { "plate", "cabType", "capacity" },
  "summary": { "bookings": 3, "expectedSeats": 7, "boardedSeats": 5, "remaining": 2 },
  "parties": [ {
    "bookingId", "code", "passengerName", "passengerPhone",
    "seats": 2, "boardedCount": 2,
    "boardingState": "boarded",     // not_boarded|partial|boarded
    "stageName", "homePickup": true, "homeAddress", "homeSurcharge"
  } ],
  "cacheExpiresAt": "..."
}
```

**Data minimisation, enforced server-side:** no fare amounts, no payment state,
no ledger info, **no passenger ID number or email**. A driver collecting strangers
does not need them, and a driver is a higher-risk holder of that data than the
dispatch system.

A trip not assigned to the caller returns **`404`** — never `403` — so the
endpoint cannot be used to confirm another driver's trip exists.

`cacheExpiresAt` is the app's instruction to purge its cached copy. Passenger
names, numbers and addresses must not sit on a phone indefinitely.

---

### `POST /driver/assignments/{tripId}/boardings`

```jsonc
{
  "bookingId": "...", "count": 2, "method": "qr",
  "clientActionId": "<uuid generated on device>",
  "deviceId": "<install-uuid>", "observedAt": "2026-10-01T11:10:00Z"
}
```

**`clientActionId` is the whole safety story.** The app generates it *before*
attempting the request and reuses it on every retry. It is a unique DB column, so:

- a double-tap → `duplicate: true` with the original result
- a retry after a timeout that actually succeeded → `duplicate: true`
- neither increments `boardedCount` again

**`count` is clamped to the seats remaining** on that booking — a 13-seat
manifest cannot be satisfied by claiming 20 boarded. Partial boarding is
first-class: "2 of 4" is stored honestly, and the remainder is never silently
marked present.

`boardedCount` is always **recomputed** from the `BoardingRecord` rows, never
incremented blindly, so it cannot drift from the audit trail.

---

### `GET /driver/earnings`

```jsonc
{
  "lifetime": { "gross": 120000, "commission": 18000, "surcharge": 4000,
                "net": 106000, "trips": 42 },
  "thisWeek": { ... }, "shared": { ... }, "chartered": { ... },
  "queued": { "amount": 8400, "count": 3 },
  "paid":   { "amount": 98000, "count": 38 },
  "failed": { "amount": 1200, "count": 1 },
  "rides":  { "total": 42, "shared": 38, "chartered": 4, "passengerSeats": 310 },
  "commissionRatePercent": 15,
  "lines": [ { "routeName", "serviceType", "gross", "commission", "net", "status" } ]
}
```

Derived entirely from `PayoutRecord` — the records finance actually settles — so
a refund or no-show removes value automatically. **This is a statement, not a
wallet:** no balance to spend, no transfer, no top-up. Nothing here moves money.

The `chartered` vs `shared` split is derived from each trip's own charter
bookings rather than a duplicated flag that could disagree.

---

### `GET|POST /driver/charter-subscription`

`GET` returns plan, benefits, current entitlement and charter-vs-shared
performance. `POST` records **interest only** — no charge, no entitlement.

Deliberate. Physical transportation is excluded from Google Play Billing, and
whether charging drivers makes them employees or contractors is a Kenyan legal
question. See `docs/01-tech-stack.md` §5.

---

## Offline contract

| Action | Offline behaviour |
|---|---|
| View assigned work | Cached copy with a visible "last updated" time |
| Record boarding | Persisted to Room; UI shows **"waiting to sync"** — never "boarded" |
| Accept / decline | Requires server authority; not queued |
| Earnings / payout | Never cached as authoritative; never shown confirmed offline |

Queued actions replay via `ActionSyncWorker` (WorkManager,
`NetworkType.CONNECTED`) and on app foreground, **reusing the original
`clientActionId`**. A business rejection is marked failed and stops retrying — a
driver must be told, not spammed.
{ "tripId": "...", "action": "accept", "expectedVersion": 3 }
{ "tripId": "...", "action": "decline", "reason": "Vehicle breakdown",
  "expectedVersion": 3 }
```

- `expectedVersion` rejects a decision made against a stale screen.
- `decline` **requires a reason** — without one dispatch cannot recover the
  trip, and "no reason given" is the top cause of a stranded passenger.
- Accepting locks a `scheduled` trip, so a driver is not told to turn up for
  5 people and find 9.
- The response carries an explicit note that this is **not** a payment.
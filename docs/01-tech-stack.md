# Mireli Driver — Technology Stack & Engineering Plan

**Status:** MVP skeleton. Nothing here is certified, Play-reviewed, or legally cleared.
**Scope:** The driver-facing Android app + the shared backend changes in Mireli Web.

---

## 1. What I found before choosing anything

I audited the existing Mireli Web codebase at `C:\Users\SOOQ ELASER\Desktop\msafiri`
rather than assuming its shape. The decisive finding:

> `prisma/schema.prisma` already carried this comment on the `Driver` model:
> *"There is no driver UI in Mi-Reli — the driver app is a separate build by a
> separate team; it would consume these same records via API."*

So the integration boundary was already designed. **Mireli Driver does not get
its own database of drivers, trips or money.** It is a second client of the same
records — the same separation Uber and Bolt use between rider app, driver app
and dispatch console.

| Existing asset in Mireli Web | Reused as-is |
|---|---|
| `Driver` (name, phone, mpesaNumber, plate, cabType, capacity, status, rating) | Yes — extended, not replaced |
| `Trip` (driverId, direction, departureAt, capacity, bookedSeats, status, trainId) | Yes — extended with assignment lifecycle |
| `Booking` (code, seats, isCharter, fareAmount, status, frozen passenger snapshot) | Yes — the manifest reads these |
| `LedgerEntry` — `held → driver_payable → commission_taken / refunded / …` | Yes — the earnings screen reads this |
| `PayoutRecord` (gross, commission, surcharge, net, status, batchId) | Yes — already how finance settles |
| M-Pesa Daraja integration (STK, reversal, B2C, transaction status) | Yes — untouched |
| `PlatformConfig` (commission 15%, NTSA cap 18%, buffers, payout mode) | Yes — single source of commercial truth |

**No second book of records. No mobile-side database of business truth.**

---

## 2. The stack, and why each choice

### Android — Kotlin + Jetpack Compose (native)

| Concern | Choice | Why |
|---|---|---|
| Language | Kotlin | Coroutines + null safety for a network-and-offline-heavy app |
| UI | Jetpack Compose + Material 3 | Dynamic colour is wrong for a brand, so we use Mireli Web's tokens |
| DI | Hilt | Compile-time graph; forces us to declare what the app actually needs |
| HTTP | Retrofit + OkHttp + kotlinx.serialization | `ignoreUnknownKeys` means a server deploy can't crash older phones |
| Local queue | Room | Durable outbox for boarding actions taken offline |
| Token storage | EncryptedSharedPreferences + Keystore | Auth token is the one value worth an extra layer |
| Deferred sync | WorkManager + `NetworkType.CONNECTED` | Wakes when signal returns; not continuous work |
| Location | Foreground service (`location` type) | Only during an active trip; never while merely "available" |

**Alternatives rejected, and why:**

- **WebView wrapper** — poor at trip tracking, camera scanning, and surviving
  process death. Those three are the app's core.
- **React Native / Flutter** — both viable if the team already knows them, but
  background location, FGS types and QR scanning all need native modules.
  Prototype those three first if you go that route; don't assume parity.
- **Native Views/XML** — more boilerplate, slower on exactly the manifest and
  boarding screens where the MVP's complexity lives.

### Backend — extend the existing Next.js, do not add a service

Mireli Web is Next.js 16 + Prisma 6 + SQLite. The MVP adds a `/api/driver/*`
route group and `src/lib/driver-*.ts`. **No new service, no new database, no
message broker.** The hard problems here are correctness and money, not scale.
Splitting services before the booking write path is atomic would create two
sources of truth — the exact problem the single-backend design prevents.

### What I did **not** add, and why

| Not added | Reason |
---

## 3. The five screens you asked for

| # | Your requirement | Endpoint | Key design decision |
|---|---|---|---|
| 1 | Assigned passengers manifest | `GET /api/driver/assignments/{tripId}/manifest` | Name + phone + pickup **only**. No fares, no payment state, no ID numbers |
| 2 | Accept / decline trip | `POST /api/driver/assignments` | Decline **requires a reason**; acknowledgement is the only "yes" that counts |
| 3 | Earnings breakdown (hailed vs chartered) | `GET /api/driver/earnings` | Split gross → commission → surcharge → net, so the number explains itself |
| 4 | Rides count | `rides` block on `/earnings` + `/me` counters | **Derived from completed trips**, not a counter that could drift |
| 5 | Charter subscription button | `GET/POST /api/driver/charter-subscription` | Records **interest only** — no in-app charge. See §5 |

---

## 4. Non-negotiable invariants (the "must-haves")

1. **One driver's trip is unreachable from another driver's phone.** Every read
   filters on `trip.driverId === session.driverId`. A foreign trip id returns
   `404`, never `403` — otherwise the endpoint confirms the trip exists.
2. **A boarding tap cannot be counted twice.** `clientActionId` is generated on
   the device *before* the request and is a unique DB column, so a retry or a
   double-tap resolves to the original result.
3. **Offline boarding is never reported as confirmed.** No connectivity →
   persisted to Room → UI says *"waiting to sync"*. Presenting it as boarded
   would let a vehicle leave with passengers the system thinks never arrived,
   triggering bogus no-show refunds.
4. **Partial boarding is recorded honestly.** "2 of 4 arrived" is stored as-is;
   the remainder is never silently marked present.
5. **Earnings are derived from settlement records.** Never from a running total,
   never from client input. A refund removes value automatically.
6. **Acknowledging a trip is not payment.** The API returns an explicit note so
   the UI can say so.
7. **Suspending a driver takes effect immediately.** `status` is re-checked on
   *every* request, not only at login.

---

## 5. The charter subscription — read this before building it

I implemented the button as **request-for-interest, not a purchase**. This is
deliberate and is the one place I deviated from a literal reading of the
requirement. Three reasons:

1. **Google Play excludes physical transportation payments from Play Billing.**
   A subscription for access to charter *work* is not a digital good, so it
   cannot use Play's payment flow anyway.
2. **Whether charging drivers makes them employees, agents or independent
   operators is a Kenyan legal question.** It must be settled by the owner and a
   Kenyan labour lawyer before money changes hands. Shipping a live checkout
   would be a developer making that decision by accident.
3. **Collecting money in an unenforceable form is worse than collecting it late.**

Activation is therefore an admin action. When the commercial model is signed
off, `POST` gains a payment step and ledger flow — and that change is localised
to one endpoint.

---

## 6. Honest status

| Part | State |
|---|---|
| Backend schema, libs, 7 endpoints | **Written.** Not yet compiled — see below |
| Android Gradle project, DI, DTOs, repositories, sync worker | **Written.** Not yet compiled |
| UI screens (Compose) | **Partially written** — see §7 |
| Type-check / lint / tests | **Not run** |
| Play release build | **Not attempted** |

### Two blockers you must know about

**1. This machine has no JDK, Gradle, or Android SDK.**
I can write Android source but **cannot produce an APK here**. You need Android
Studio (JDK 17, SDK 36) for the first build. Treat every Kotlin file as
reviewed-but-uncompiled.

**2. `msafiri/node_modules` is not installed, and installing it is failing.**
`bun` hangs on any invocation on this machine. `npm install` runs but has not
completed — there is no `package-lock.json`, so it is resolving the full Next.js
16 tree from scratch. Until it finishes, **the TypeScript I wrote has not been
type-checked.** Treat the backend as unreviewed-by-compiler too.

> **Important incident:** partway through, an external git sync on `msafiri`
> reverted my edits to `prisma/schema.prisma` and `src/lib/audit.ts` (tracked
> files). Untracked new files survived. I reapplied everything and re-verified —
> `git diff --stat` shows 238 insertions across both files and all 18 Prisma
> models are present. **If you see these files reverted again, check whether
> something is running `git checkout` on that repo.**

---

## 7. Next steps, in order

1. **Get dependencies installed** — `npm install` in `msafiri`, then
   `npx prisma generate && npx prisma db push` and `npx tsc --noEmit`.
   Fix whatever surfaces. I expect a few type errors.
2. **Install Android Studio** (JDK 17 + SDK 36), open `android/`, run
   `./gradlew :app:assembleDebug`. Fix whatever surfaces.
3. **Finish the Compose screens** — `Today`, `Assignment`, `Manifest`,
   `Boarding`, `Trips`, `Earnings`, `Account`, `Charter`.
4. **Seed a test driver** and walk the full loop on a real device at the
   terminus — deliberately in airplane mode.
5. **Then** discuss payments, maps, push, and the legal work in §5.

---

## 8. Decisions I need from you

| # | Question | Why it blocks |
|---|---|---|
| 1 | Confirm domain/brand ownership before locking `applicationId` | Changing it after publish = a brand-new Play app |
| 2 | Is the driver a contractor or an employee? | Decides the charter subscription; NTSA's 18% cap may not apply to a shared shuttle |
| 3 | What licence class and PSV documents must a driver hold? | Drives the eligibility rules I stubbed |
| 4 | Should `reportAt` be a hard deadline? | Determines whether dispatch escalates automatically |
| 5 | Who in dispatch may see another driver's manifest? | I scoped staff access out of the MVP |
|---|---|
| Redis / message broker | Unnecessary at this scale; adds a failure mode |
| Push (FCM) wiring | Schema + endpoint exist; needs a Firebase project |
| Maps SDK | Needs an API key and field-testing in Mombasa. External nav app for MVP |
| Face recognition / biometrics | Explicitly deferred; serious privacy + legal load |
| Driver-side earnings ledger | The server ledger is authoritative; the app only *reads* it |
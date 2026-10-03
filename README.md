# Mireli Driver

The driver-facing Android app for Mi-Reli, sharing one authoritative backend
with the existing Mireli Web passenger site.

> **This is an MVP skeleton.** It is not compiled, not tested, not Play-reviewed
> and not legally cleared. Read [`docs/01-tech-stack.md`](docs/01-tech-stack.md)
> §6 before assuming any of it works.

---

## What the driver will see once signed in

| # | Requirement | Where |
|---|---|---|
| 1 | Assigned passengers manifest for that trip | `GET /api/driver/assignments/{tripId}/manifest` |
| 2 | Accept / decline the trip | `POST /api/driver/assignments` |
| 3 | Earnings breakdown — hailed vs chartered | `GET /api/driver/earnings` |
| 4 | Rides — number of trips made | `rides` block on `/earnings` |
| 5 | Charter subscription button | `GET/POST /api/driver/charter-subscription` |

Full request/response shapes: [`docs/02-api-contract.md`](docs/02-api-contract.md).

---

## Repository layout

```
mireli driver/
├── docs/
│   ├── 01-tech-stack.md          stack, findings, invariants, blockers
│   └── 02-api-contract.md        endpoint-by-endpoint contract
├── scripts/
│   ├── check-structure.mjs       brace-balance check for all sources
│   └── check-schema.mjs          prisma model/relation validation
└── android/                      the Android application
    ├── gradle/libs.versions.toml version catalog (single source of versions)
    └── app/src/main/
        ├── AndroidManifest.xml    permission set, deliberately minimal
        ├── res/values/           brand colours + all user-facing strings
        └── java/co/ke/mireli/driver/
            ├── data/
            │   ├── local/        encrypted token store, Room offline queue
            │   ├── remote/       Retrofit API, DTOs, auth interceptor
            │   ├── repository/   boarding + offline-safe command handling
            │   └── sync/         WorkManager replay of queued actions
            └── di/               Hilt modules
```

The backend lives in the **existing** Mireli Web repo at
`C:\Users\SOOQ ELASER\Desktop\msafiri`, added as
`src/lib/driver-*.ts` and `src/app/api/driver/`. There is deliberately **no
second database** — see `docs/01-tech-stack.md` §1.

---

## The three rules that matter most

1. **A boarding tap can never be counted twice.** The device generates
   `clientActionId` before the request; the server enforces uniqueness. A
   double-tap or a retry after a timeout that actually succeeded returns the
   original result instead of incrementing again.
2. **Offline is never shown as success.** No connectivity → queued in Room →
   the UI says *"waiting to sync"*. Otherwise a vehicle leaves with passengers
   the system believes never boarded, and real passengers get bogus no-show
   refunds.
3. **Earnings are read from finance's settlement records**, never accumulated in
   the app. A refund reduces the number automatically.

---

## Before you can build

| Requirement | Status |
|---|---|
| JDK 17 | **Not installed on this machine** |
| Android SDK (API 36) | **Not installed on this machine** |
| `msafiri/node_modules` | **Not installed** — `bun` hangs here; `npm install` stalls resolving |

Install Android Studio, then:

```bash
# backend
cd "C:\Users\SOOQ ELASER\Desktop\msafiri"
npm install
npx prisma generate && npx prisma db push
npx tsc --noEmit

# structural checks that work with zero dependencies
cd "C:\Users\SOOQ ELASER\Desktop\mireli driver"
node scripts/check-structure.mjs
node scripts/check-schema.mjs

# android
cd android
./gradlew :app:assembleDebug
```

Expect type errors on the first compile — this code has never been through a
compiler. That is the first task, not a sign of a design problem.

---

## Configuration

`android/gradle.properties` or `~/.gradle/gradle.properties`:

```properties
MIRELI_API_BASE_URL=https://staging.mireli.co.ke
MIRELI_DEBUG_API_URL=http://10.0.2.2:3000   # 10.0.2.2 = host machine from emulator
MIRELI_KEYSTORE=/secure/path/release.jks     # NEVER commit this
MIRELI_KEYSTORE_PASSWORD=…
MIRELI_KEY_ALIAS=…
MIRELI_KEY_PASSWORD=…
```

`applicationId` is currently `co.ke.mireli.driver` — **a placeholder**.
Confirm domain and brand ownership before the first release; changing it after
publishing creates a brand-new Play app.
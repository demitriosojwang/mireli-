# Mireli Driver — Compliance Console & Ride Acceptance

**Status:** Console UI complete and syntax-verified. Backend API **not yet
rebuilt** — see "The msafiri incident" below.

---

## 1. What you can see now

`console/` is a standalone Next.js admin app (port 3100) with three sections:

| Section | Purpose |
|---|---|
| **Compliance** | The driver review queue — approve or reject documents, clear a driver to drive, suspend, reject, or nudge a stalled applicant |
| **Ride Offers** | Dispatch hands work to drivers, who accept or decline in the app (nav wired; page not yet built) |
| **Register** | Intended for new-driver invitations |

Run it:

```bash
cd "mireli driver/console"
npm install
npm run dev            # http://localhost:3100
```

It proxies `/api/*` to `http://localhost:3000` (set `MIRELI_API_ORIGIN` to
change), so it reuses the existing Mireli admin cookie session rather than
inventing a second identity system.

---

## 2. The compliance flow

The console is the **only** place a driver becomes eligible to drive. Two rules
shape it:

1. **No bulk approve, no auto-approval.** Each requirement is decided by a named
   human, because the alternative is a regulator asking who cleared an
   unlicensed driver and finding nobody.
2. **Every action is attributed.** Rejections and suspensions require a reason
   the driver will see. A rejection a driver cannot act on is worse than none.

### What a reviewer sees

- **Cards, never a table.** One driver per card, ordered by urgency. A reviewer
  scans faces and states, not row identifiers.
- **Blocking work stated in words** — "3 items need attention" — not implied by
  a percentage.
- **The requirement's own guidance inline:** issuing authority, why we require
  it, the legal source, and a confidence tag (`Confirmed` / `Verify` /
  `Added — gap`). A reviewer should know which verdicts rest on gazetted text.
- **Expiry prefilled** from the requirement's standard validity, but editable —
  compliance often imposes a shorter window.
- **Approve is disabled while anything is outstanding.** Client-side for
  clarity; the server refuses regardless.

---

## 3. The iOS-flavoured UI

"IOS feel" here is the **interaction and layout language**, not a skin. Copying
Apple's palette or assets would be off-brand and a legal problem; borrowing the
layout grammar is neither. Brand colour stays Mireli's navy/orange.

| Pattern | Where |
|---|---|
| Grouped inset lists on a soft grey canvas | `.mi-group` / `.mi-row` |
| Hairline separators, not borders | `inset 0 -1px 0` on every row |
| Large radii (20–28px) and very soft, wide elevation | `--mi-r-lg`, `--mi-shadow-md` |
| Bottom tab bar → left sidebar on wide screens | `components/app-shell.tsx` |
| Sheet presentation with a drag grabber | review sheet header |
| Pill buttons that scale on press | `.mi-btn:active` → `scale(0.97)` |

### Responsiveness

| Width | Layout |
|---|---|
| < 640px | Bottom tab bar, 2-column stat grid, full-width rows, sheet from the bottom |
| ≥ 640px | 3-column stats, dialog centres with padding |
| ≥ 1024px | Persistent left sidebar, 5-column stats, `max-w-4xl` content |

**One markup tree at every size** — only the container's flex direction and item
presentation change via `lg:` prefixes. That is what stops the layouts drifting
apart as the console grows.

### Accessibility

- Colour is **never** the only signal — every pill carries a word
- `prefers-reduced-motion` honoured globally
- `env(safe-area-inset-*)` applied for notch and home indicator
- Focus-visible outline kept; only `:active` removes the ring
- `aria-pressed` on toggles, `role="dialog"` + `aria-modal` on sheets,
  `aria-live` on the toast
- 16px inputs, which stops iOS Safari/Chrome zooming the viewport on focus

---

## 4. The msafiri incident — read this

Partway through the previous session, **an external process wiped every backend
file I had written in `msafiri`**:

| | Before | After |
|---|---|---|
| Prisma models | 25 | 14 (reverted) |
| `src/app/api/driver/**` | 7 routes | deleted |
| `src/lib/driver-*.ts` | 3 files | deleted |

This was the **second** occurrence — an earlier one reverted my edits to tracked
files while leaving untracked ones alone. A `delrefs.txt` file appeared in the
repo root containing Cline checkpoint-ref deletions, and the pattern matches a
**checkpoint restore** rolling the repository back.

`mireli driver/` was untouched both times, which is why option B was safe.

**Two responses, both now in place:**

1. **This repo is under git.** 44 files committed as `331a05a`. Nothing here can
   be silently lost again — `git log` proves it, and `git checkout` restores it.
2. **Verification scripts run in under a second** and always report honestly:
   ```bash
   node scripts/syntax-check.mjs      # parse-check, no type graph
   node scripts/check-structure.mjs   # brace balance
   node scripts/check-nesting.mjs     # illegally-nested declarations
   node scripts/check-schema.mjs      # prisma models + relation targets
   ```

> **The syntax checker earned its keep immediately.** It caught `review-sheet.tsx`
> with 30 parse errors — my incremental edits had repeatedly spliced new content
> into the *middle* of JSX elements and function bodies, silently truncating them.
> Brace-balance checking passed those files happily; only a real parse failed.
> That is why it exists.

---

## 5. What is NOT done

| Item | State |
|---|---|
| Backend `/api/admin/onboarding`, `/api/driver/offers/**`, `/api/driver/**` | **Wiped. Needs rebuilding** |
| `prisma/schema.prisma` additions | **Reverted. Needs reapplying** |
| Ride Offers console page | Nav wired, page not built |
| Android Compose screens | Skeleton only (data layer done) |
| `npm install` in console | Not run — no `node_modules` |
| Visual QA on real devices | Not done |

The console **cannot be run yet** — it needs its backend. That is the next job.
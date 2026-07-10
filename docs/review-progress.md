# Code review — progress & handoff

A staged, multi-pass correctness review of the LIMS codebase, run with Claude Code (Fable 5) using
dynamic multi-agent ("ultracode") workflows. This file is the pick-up point for a fresh session:
read it, then run the next pending pass. Full project context is in `CLAUDE.md` (invariants, build
order, conventions) and `docs/decision-log.md` (every design decision, dated, with reasoning).

## Working agreements (carry into every review session)

- **Model: Fable 5 only.** If a turn is ever routed to another model, **stop** — do not continue the
  work on another model. (Ramazan's standing rule.)
- **Git is Ramazan's.** Never run git write commands. After each task, report the list of changed
  files so he can commit.
- **Comment every change** with a short inline note saying *what* changed and *why*, so Steven (the
  backend dev partner) and future readers can follow it.
- **Keep a running changelog.** At the end of the review, produce `docs/review-changes.md` listing
  every change made and the reasoning behind it, written for Steven.
- **Find → verify → fix.** Only apply a fix that survives an independent double-check against the
  real code. After applying fixes, run `npx next build` and the relevant behavioral checks before
  reporting done. Never claim "all fixed" without verifying.
- **Developer decisions are Ramazan's.** If a fix implies a design choice, present options + a
  recommendation and let him choose; don't decide unilaterally.

## Workflow-routing workaround (why this is staged the way it is)

Launching a multi-agent workflow from a *long* session whose recent history is dense with
security/auth/secrets discussion tends to get the turn routed off Fable. To avoid that:

- **Run each pass from a FRESH session** with a **short, neutral trigger** (see prompts below). A
  fresh chat is still the same model + tools and auto-loads `CLAUDE.md` + memory + this file — only
  the ephemeral chatter is dropped, which is exactly what we want gone.
- **Keep review prompts in plain correctness/quality language** ("verify this property holds for
  every case"), not adversarial/attacker framing.
- **Do the auth/backend pass INLINE** (main-loop reads + report), not as a workflow — inline turns
  have been reliable even on the backend files.

## Audit ledger

**Already reviewed** (adversarial multi-agent audit done, findings fixed):
Epic A (US-A1–A7) · US-B1 · US-C1–C4 · US-B2 · **Pass 2: US-B3 · US-D1 · US-D3 (6 Jul 2026 —
18 findings confirmed, 14 fixed, 4 held as decisions for Ramazan, see below; changes in
`docs/review-changes.md`)**.

**Pending:**

| Pass | Scope | How |
|---|---|---|
| 3 | US-D4 data entry · US-D5 instrument import · US-D6 review & completion | workflow |
| 4 | US-D2 work queue · cross-cutting consistency sweep over everything the fixes touched | workflow |
| Backend | Steven's Supabase auth layer (see file list below) | **inline, not a workflow** |

## Pass-2 open decisions (Ramazan — options + recommendation, not yet built)

1. **Never-calibrated equipment computes Available and passes D3 step gating** (high).
   `calibrationState(null)` = "none" contributes neither block nor warning, and creation collects
   no calibration — a brand-new balance is instantly selectable for a weighing step ("no weighing
   on a balance that isn't calibrated" is US-B3's core example; the logged never-performed-check
   decision made the opposite call for checks). Options: (a) treat "none" as a blocking reason,
   mirroring the check decision — **recommended**, simplest and symmetric, makes calibration
   mandatory-by-consequence; (b) collect calibration in the create dialog; (c) an explicit,
   audited "calibration not required" declaration per equipment, with "none + not declared" blocking.
2. **Retiring a check type (or re-scheduling it to per-use) clears an active Blocked state**
   (medium). A manager can retire the check whose last result FAILED and the meter is Available on
   the next read — while `updateCalibration` refuses the equivalent move for calibration, and
   `logCheck` refuses new entries on a retired type, so the fail can never be superseded. Options:
   (a) refuse retiring/re-scheduling a check type that is currently the source of a blocked
   reason (require a passing entry or out-of-service first) — **recommended**, mirror of the
   calibration guard; (b) keep a failed last result blocking even after retirement; (c) log
   retire-clears-block as a deliberate decision distinguishing it from calibration removal.
3. **voidSample/voidJob succeed with no warning while the sample sits in an open batch** (high).
   The batch keeps treating it as a live member (results enterable, review can validate them,
   completion counts it, batch deadline still driven by the voided job), while the job page says
   Voided. The batch views now at least SHOW the voided state (pass-2 fix). Options: (a) block
   the void while the sample is in an open/awaiting-review batch, pointing to the sanctioned
   exits (open-window removal, US-D4 no-result, US-D3 batch void) — **recommended**, mirror of
   the acceptance freeze; (b) allow with a strong warning and define what the batch should do
   with a voided member. Note: US-D1 AC 10 names the no-result route as the mid-run exit.
4. **Manufacturer, model, serial number and location are optional on create/edit** (low), while
   US-B3 AC 2's wording marks only the description optional. Options: (a) make the four fields
   required server-side; (b) keep them optional and log the relaxation (e.g. in-house built
   equipment) as a deliberate decision — either is fine, it just must be decided and recorded.

## Pass file-scopes

**Pass 2**
- B3: `lib/equipment/{types,mock,decimal,index}.ts`, `app/(app)/quality/equipment/**`
- D1: `lib/batches/{types,mock,progress,index}.ts` (creation/composition), `app/(app)/batches/{page,actions,batches-client}.tsx`, `app/(app)/batches/new/**`
- D3: `lib/batches/mock.ts` (step engine: completeStep/setBackStep/voidBatch/updateComposition), `app/(app)/batches/[id]/**`, `lib/methods/{mock,types}.ts` (per-step required equipment types)

**Pass 3**
- `lib/batches/{mock,parse,import-parse}.ts` (D4 entry + D5 import engines), `lib/mock-db.ts` (measurement/import/review record shapes + seeds), `app/(app)/batches/[id]/{results-grid,import-dialog,review-panel}.tsx`, `app/(app)/batches/import-configs/**`

**Pass 4**
- D2: `lib/batches/mock.ts` (list/claim/assign), `app/(app)/batches/{page,batches-client}.tsx`, `app/(app)/batches/[id]/batch-detail-client.tsx` (assignee UI)
- Consistency: re-scan every file the pass-2/3/4 fixes touched for regressions and duplicated logic.

**Backend (inline)**
`lib/auth/supabase.ts`, `lib/supabase/server.ts`, `lib/auth/context.ts`, `lib/auth/{types,mock}.ts`
(validateSession), the server-action edits in `app/(app)/actions.ts`,
`app/(app)/settings/support-access/actions.ts`, `app/platform/actions.ts`, `app/(auth)/actions.ts`,
the three SQL migrations in `lims-supabase/supabase/migrations/`, `config.toml`, the CI workflow,
the seed script, and the committed `.env.local`.

## Domain rules to check against (quick reference — full detail in CLAUDE.md / decision-log.md)

- Decimal values stored as **strings** at full precision, never floats; numeric comparison via exact
  integer/BigInt scaling; a decimal separator is never guessed (ambiguous input rejected).
- Equipment availability (Available / Due soon / Blocked) is **computed on every read**, never
  stored; there is **no** generic manual "unblock" — recovery is by resolving the condition.
- Per-(sample × method) batch progress is **derived** from batch membership, not stored — a void or
  set-back must never leave a stale status.
- Batch composition has a **one-way latch**: editable only until the first step advance / recorded
  work, then locked forever; a set-back is rework and never reopens composition.
- A batch **pins a method version** at creation; publishing a newer version changes nothing on it.
- Capacity = client samples + QC positions, enforced server-side at the boundary.
- IDs (batch numbers, sample IDs) are **never reissued**; histories are **append-only** (a
  correction/redo is a new record, original retained).
- Every mutating action is **server-enforced** (UI hiding is never the boundary) and **tenant- and
  lab-scoped** — no read/write may cross the organisation boundary; org-composite keys prevent
  cross-tenant ID collisions.

## Test-harness note

Behavioral checks per story were run by copying the real `lib` modules into a scratch dir with
rewritten import paths and running under `node --experimental-strip-types --no-warnings`. Full-app
check: `npx next build` (should be green, ~23 routes). The mock store version key in `lib/mock-db.ts`
is bumped whenever the seed shape changes.

## Status

- **Pass 2 complete (6 Jul 2026).** Run as an ultracode workflow on Fable 5 (12 reviewers →
  merge → 3 double-checks per finding → coverage critic → 5 targeted round-2 reviewers; 18
  confirmed findings, 1 rejected). 14 fixed with inline comments; 4 held as the decisions above.
  Verified: `npx next build` green; 52 behavioral checks (scratch harness, real lib modules) all
  passing. Changes + reasoning for Steven: `docs/review-changes.md`. New decision-log entries
  dated 6 Jul 2026.
- **Pass-2 changed files (for Ramazan's commit):** `lib/batches/mock.ts`,
  `lib/batches/progress.ts`, `lib/batches/types.ts`, `lib/jobs/mock.ts`, `lib/equipment/mock.ts`,
  `lib/equipment/types.ts`, `lib/mock-db.ts` (pendingImports gains `configJson` — ephemeral, no
  store-version bump needed), `app/(app)/batches/[id]/batch-detail-client.tsx`,
  `app/(app)/batches/[id]/results-grid.tsx`, `app/(app)/batches/[id]/review-panel.tsx`,
  `app/(app)/quality/equipment/[id]/detail-client.tsx`, `docs/decision-log.md`,
  `docs/review-changes.md`, this file.
- **Earlier this effort:** `app/(auth)/login/page.tsx` — the demo-accounts box is now hidden
  when the Supabase backend is active (`NEXT_PUBLIC_SUPABASE_URL` set), since those demo credentials
  don't exist on the real backend and a login page shouldn't enumerate real accounts. Recorded in
  `docs/review-changes.md`.
- **Next up (full remaining plan, in order):** pass 3 (US-D4 · US-D5 · US-D6) as a workflow →
  pass 4 (US-D2 + consistency sweep) as a workflow → a re-verification workflow sweep over the
  already-reviewed areas (Epic A · B1 · B2 · C1–C4 · pass-2 scope; Ramazan wants everything
  covered, spare tokens available — focus on regressions from the fixes and anything earlier
  passes missed) → the backend pass **inline and last** (keep all workflow launches before it,
  per the routing workaround above). When Ramazan decides the four open items, build them too.

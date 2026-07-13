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
18 findings confirmed, 14 fixed, 4 held as decisions for Ramazan, see below)** · **Pass 3:
US-D4 · US-D5 · US-D6 (10 Jul 2026 — 38 findings confirmed, 30 fixed, 8 held)** · **Pass 4:
US-D2 + consistency sweep over the pass-2/3 fix areas (13 Jul 2026 — 15 findings confirmed
unanimously, 13 fixed, 2 held as decisions for Ramazan, see below; changes in
`docs/review-changes.md`)**.

**Pending:**

| Pass | Scope | How |
|---|---|---|
| Re-verify | regression sweep over all previously reviewed areas (Epic A · B1 · B2 · C1–C4 · pass-2/3/4 scope) | workflow |
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

## Pass-3 open decisions (Ramazan — options + recommendation, not yet built)

1. **Completion gate accepts a bare rejected cell** (high — genuine AC 6 vs AC 5 tension).
   AC 6 enumerates the completable final states as "valid, or rejected **accompanied by** a
   superseding valid value or an explicit no-result, or no-result"; AC 5 says "a rejected value
   that will not be re-measured stands as rejected-with-reason". The code enforces the AC 5
   reading: a current-rejected cell never blocks completion, so epic F's "report the valid set"
   gets a silent hole. Options: (a) enforce AC 6 literally — a current-rejected cell blocks
   completion, and the reviewer gets a closure route (allow a superseding no-result on a
   rejected current cell during review) — **recommended**, honors the no-silent-holes promise;
   (b) keep the AC 5 reading, amend AC 6 via the Notion route and log the decision.
2. **The completeness gate ignores QC cells** (medium). A QC cell with NO record is neither a
   gap nor undecided: a batch completes with a wholly unmeasured blank and afterwards no flow
   can ever account for it. AC 4's text says "(sample × analyte)" but AC 6 says "every cell" and
   AC 7 puts QC on the same model. Options: (a) include QC entries in the gap list and let
   closeGapNoResult accept QC targets — **recommended** (§7.7 anchor; entry grid and gap list
   currently disagree about the cell universe); (b) keep sample-only and log the exclusion.
3. **Excel number cells import through a float** (high). exceljs `.text` on a number cell is the
   stored IEEE double rendered by JS, not the displayed text: "0.010" (format `0.000`) imports
   as "0.01" — entered precision is altered, contradicting the logged never-float rule; under a
   declared-comma config every number cell is rejected with a misleading message. Options:
   (a) accept only string-typed cells, rejecting number/date/formula cells per cell with reason
   "stored by Excel as a number — cannot be read as original text" — **recommended**, ADR-4-
   consistent (labs export CSV or text-formatted sheets); (b) render via the cell's number
   format (deterministic but itself an interpretation, and rounds); (c) accept the
   shortest-string double and log the precision caveat as an accepted deviation.
4. **Numeric-looking qualifier names reinterpret instrument text** (high). An admin can rename a
   qualifier to "12"; every pasted/auto-read cell "12" then becomes a qualifier record instead
   of the measured number (preview shows "✓ 12" — indistinguishable). Options: (a) forbid
   qualifier names that parse as numbers or start with `<`/`>` in updateList AND reject cells
   matching both a qualifier and the numeric grammar as ambiguous — **recommended** (both);
   (b) only the interpretRawCell ambiguity rejection (existing numeric-named qualifiers stay as
   dead weight).
5. **Excel import reads `worksheets[0]`, undeclared and unvalidated** (high). The first sheet in
   tab order is parsed — even a hidden one; instrument exports often put a Summary sheet first,
   whose rounded values import as plausible data. Options: (a) declare the sheet name in the
   import configuration and refuse when absent — **recommended** (AC 1: "the configuration
   defines the mapping"); (b) refuse workbooks with more than one visible sheet; (c) log a
   first-visible-sheet convention (and at minimum never read a hidden sheet).
6. **AC 6's locale display is not implemented** (low). The grid shows canonical point-form
   values to every user ("12.4", never "12,4"). Data correctness is unaffected; implementing it
   naively creates the copy/re-paste ambiguity trap the parser guards against. Options: (a) log
   the deviation and amend AC 6 via the Notion route — **recommended**; (b) implement
   locale-aware display from a per-org/per-user setting, format-only, copy-out canonical.
7. **Import-configs page scopes to the active lab** (low), deviating from the 4 Jul masterdata
   exemption (QC/equipment pages show all the user's labs) and dead-ending an admin with no lab
   assignments. Options: (a) extend the exemption using the QC-materials lab-resolution pattern
   — **recommended**; (b) log active-lab scoping for this screen as deliberate.
8. **An all-skipped/all-rejected confirm refuses before storing the import event** (low). The
   typed skip reasons and the rejected-cell accounting are recorded nowhere; there is no trace
   the transfer was attempted. Options: (a) store the event (file, checksum, snapshot, row
   outcomes) even when nothing applies and report "nothing applied" — **recommended** (§7.11
   full row accounting); (b) log refusal-only as an accepted deviation (the preview is the only
   record).

Observation for Ramazan (not a finding): the repo still has **no persistent test suite** — every
story's DoD lists tests, and the review passes verify behavior via throwaway scratch harnesses.
Worth deciding where the checks should permanently live (the suite now counts 121: pass-3's 81
re-run each pass + 40 pass-4 checks; pass-2's 52 were a separate harness).

## Pass-4 open decisions (Ramazan — options + recommendation, not yet built)

1. **The step filter cannot express steps of older pinned versions or deactivated methods**
   (medium). The dropdown is built from CURRENT versions of ACTIVE methods, but each row's step
   name comes from the batch's PINNED version — renaming a step (new version) or deactivating a
   method makes its open batches invisible to every step view ("what is waiting at Digestion"
   silently misses real waiting work). Options: (a) union the dropdown with the distinct current-
   step names of the actually listed open batches — **recommended**, the filter then always
   covers what the list shows; (b) include all versions of methods with open batches; (c) log
   the current behavior as accepted (the "Later" step-taxonomy note is adjacent but does not
   cover version pinning).
2. **Assignee=Unassigned always excludes finished batches** (low). Status=Completed +
   Unassigned is a guaranteed-empty result even when completed never-assigned batches exist —
   while "Mine" DOES match finished rows. Options: (a) drop the active-only requirement from
   the row predicate (keep it in the AC 5 pool count) — **recommended**, symmetric with Mine;
   (b) rename the option "Unassigned (open pool)" and keep the semantics.
3. *(sub-question from the pass-4 G1 fix)* **Should the composition edit that CREATES a QC-code
   collision be blocked?** Imports/worksheets now handle the collision loudly, but the working
   copy still prints the same ID cell for both entries' rows. Options: (a) block adding a
   material whose code collides with a held entry (the grandfathered entry can be removed
   first) — **recommended**, removes the ambiguity at the source; (b) keep it legal and rely on
   the loud matchers.
4. *(sub-question from the pass-4 G3 fix)* **Should a batch whose assignee can no longer act
   auto-return to the open pool (or become claimable)?** It is now BADGED everywhere, but only
   a manager reassign/unassign frees it. Options: (a) keep manager-only recovery —
   **recommended** (assignment changes stay deliberate, audited acts); (b) make such batches
   claimable; (c) auto-unassign with an audit event when the flag flips.

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
rewritten import paths and running under `node --experimental-strip-types --no-warnings`. The
cumulative suite (pass 3 + pass 4) counts 121 checks and re-runs in full each pass. Full-app
check: `npx next build` (should be green, 28 routes as of pass 3). The mock store version key in
`lib/mock-db.ts` (currently `__limsMockDbV24`) is bumped whenever the seed shape changes.

## Status

- **Backend pass STARTED, then paused (13 Jul 2026)** — all scope files were read (auth adapter,
  context, session, the four action files, 3 migrations, config.toml, CI, seed script,
  .env.local); Ramazan paused it for manual end-to-end testing. Notes so far, to fold into the
  pass when it resumes: (1) the `labs: null` Supabase fallback in `resolveOrgContext` grants a
  backend-authenticated user ALL labs of the org — org-wide scope for lab managers (the logged
  4 Jul decision says "fall back to domain-layer labs", but real backend users have no per-user
  domain assignments); (2) the DB role constraint maps unknown roles via `DB_ROLE_MAP` with
  `"user" → analyst` while the code comment says degrade to read-only.
- **Interim (13 Jul 2026): clean-start test mode** — `LIMS_CLEAN_SEED=1` seeds only the vendor
  account; provisioning now creates a working first-admin account (it previously only printed an
  invite line — dead end). `.env.local` currently runs the MOCK backend + clean seed for
  Ramazan's manual test; restore instructions are in the file. Changed files:
  `lib/mock-db.ts`, `lib/platform/mock.ts`, `lib/platform/types.ts`, `app/platform/actions.ts`,
  `app/(auth)/login/demo-accounts.tsx`, `.env.local`, `docs/decision-log.md`,
  `docs/review-changes.md`, this file.
- **Pass 4 complete (13 Jul 2026).** Run as an ultracode workflow on Fable 5 (10 reviewers —
  3 × US-D2, 7 × consistency over the pass-2/3 fix areas → merge → 3 double-checks per finding →
  coverage critic → 3 targeted round-2 reviewers). The first run lost 19 verifier agents to the
  session token limit; resumed from the workflow cache after the reset — 15 findings, all
  confirmed unanimously. 13 fixed with inline comments; 2 held as the decisions above (+2
  sub-questions). Verified: `npx next build` green; **121 behavioral checks** (the 81 pass-3
  checks re-run against the changed code + 40 new) all passing. Store key bumped to
  `__limsMockDbV24`. Changes + reasoning for Steven: `docs/review-changes.md`. New decision-log
  entries dated 13 Jul 2026.
- **Pass-4 changed files (for Ramazan's commit):** `lib/mock-db.ts`, `lib/jobs/mock.ts`,
  `lib/users/mock.ts`, `lib/batches/mock.ts`, `lib/batches/types.ts`,
  `app/(app)/batches/batches-client.tsx`, `app/(app)/batches/[id]/batch-detail-client.tsx`,
  `app/(app)/batches/[id]/import-dialog.tsx`, `app/(app)/jobs/[id]/page.tsx`,
  `app/(app)/jobs/[id]/job-detail-client.tsx`, `docs/decision-log.md`,
  `docs/review-changes.md`, this file.
- **Pass 3 complete (10 Jul 2026).** Run as an ultracode workflow on Fable 5 (15 reviewers →
  merge, 53 raw → 28 canonical → 3 double-checks per finding → coverage critic → 5 targeted
  round-2 reviewers → 11 more findings; 3 findings whose verifiers died on API connection errors
  re-verified by hand). 38 confirmed; 30 fixed with inline comments; 8 held as the decisions
  above. Verified: `npx next build` green (28 routes); **81 behavioral checks** (scratch
  harness, real lib modules) all passing. Store key bumped to `__limsMockDbV23`. Changes +
  reasoning for Steven: `docs/review-changes.md`. New decision-log entries dated 10 Jul 2026.
- **Pass-3 changed files (for Ramazan's commit):** `lib/mock-db.ts`,
  `lib/batches/import-parse.ts`, `lib/batches/mock.ts`, `lib/batches/types.ts`,
  `lib/settings/mock.ts`, `lib/settings/types.ts`, `app/(app)/batches/actions.ts`,
  `app/(app)/batches/[id]/results-grid.tsx`, `app/(app)/batches/[id]/review-panel.tsx`,
  `app/(app)/batches/[id]/batch-detail-client.tsx`, `app/(app)/settings/actions.ts`,
  `docs/decision-log.md`, `docs/review-changes.md`, this file.
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
- **Next up (full remaining plan, in order):** a re-verification workflow sweep over the
  already-reviewed areas (Epic A · B1 · B2 · C1–C4 · pass-2/3/4 scope; Ramazan wants everything
  covered, spare tokens available — focus on regressions from the fixes and anything earlier
  passes missed) → the backend pass **inline and last** (keep all workflow launches before it,
  per the routing workaround above). When Ramazan decides the sixteen open items (4 from
  pass 2 + 8 from pass 3 + 4 from pass 4), build them too.

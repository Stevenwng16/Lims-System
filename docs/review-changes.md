# Review changes — running changelog

Every change made by the staged correctness review (see `docs/review-progress.md`), with the
reasoning, written for Steven and future readers. Newest pass first. Each change also carries an
inline comment at the spot in the code; fundamental choices are one-liners in
`docs/decision-log.md`.

## Pass 3 — US-D4 data entry · US-D5 instrument import · US-D6 review & completion (10 Jul 2026)

Run as a multi-agent review (15 scoped reviewers → duplicate-merge, 53 raw → 28 canonical →
3 independent double-checks per finding → coverage check → 5 targeted round-2 reviewers, 11 more
findings, all confirmed). Three findings lost their double-checkers to API connection errors and
were re-verified by hand against the code. **38 findings confirmed; 30 fixed below; 8 are design
decisions waiting on Ramazan** (listed in `docs/review-progress.md` § "Pass-3 open decisions").
Verified: `npx next build` green (28 routes) plus **81 behavioral checks** against the real lib
modules in the scratch harness (all passing). The mock store key is bumped to `__limsMockDbV23`
(seed shapes changed).

### High — every preview→confirm flow now applies exactly the staged preview, or refuses

One theme covered six findings: paste confirm resubmitted the LIVE textarea mapping instead of
the previewed block; worksheet confirm silently applied whatever worksheet version was latest
(a replacement upload between preview and confirm wrote values the confirmer never saw, under
their attribution); both confirms silently dropped cells that became occupied and re-interpreted
raw text under the LIVE qualifier list; import confirm re-ran matching against the live batch,
so a composition edit in the 30-minute window silently overrode explicit skip/map resolutions
(a row skipped "stale run, do not use" imported anyway once its sample was added); and replace
decisions were applied against a live conflict set, so `replaceAll` superseded values entered
AFTER the preview under a reason that did not describe them.

The fix extends the pass-2 `confirmImport` frozen-config contract to everything:

- `lib/mock-db.ts` — new ephemeral `pendingBulk` staging map (one-use token, 30-min TTL, bound
  to the previewing user); `pendingImports` entries additionally freeze `matchesJson` (per-row
  match set) and `conflictsJson` (cellKey → existing record id).
- `lib/batches/mock.ts` — `previewBulk`/`previewWorksheet` stage entries + per-cell verdicts
  (+ worksheet version) and return a token; `confirmBulk`/`confirmWorksheet` take the token,
  re-run the preview server-side and refuse on ANY divergence ("run the preview again") — a
  worksheet replacement, a newly occupied cell or a qualifier change can no longer write or
  silently drop anything unreviewed. `confirmImport` refuses when the recomputed match set or
  conflict set differs from the staged one, and replace can only reach conflicts the preview
  showed, anchored to the exact record id the user saw (conflicts on rows mapped at confirm
  default to keep-existing). This also fixed the misleading dead-end error for rows whose
  sample was removed mid-window (now: "composition changed — run the preview again").
- `app/(app)/batches/actions.ts` + `results-grid.tsx` — the confirm forms post only the token;
  the paste dialog additionally disables Confirm with a hint when the block/start row diverge
  from what was previewed.

### High — a confirm-time map resolution could write two records into one cell

`computeImport`'s duplicate guard only registers rows whose target matched at parse time, so an
unknown row MAPPED at confirm onto a sample another row already writes produced two records for
one (target × analyte) — the second displacing the first with no supersede pointer and no
reason, inverting the decided first-row-wins rule. `confirmImport` now runs a cross-row
duplicate guard over the planned writes: first write stands, later ones become per-cell
rejections with the standard duplicate message.

### High — QC lot expectations are now frozen on the batch, not read live

The review view computed "expected 50.0 ±2.5 (lot …)" from the LIVE QC material, so a masterdata
correction after (or during!) review silently rewrote the context the reviewer judged against —
US-B2 AC 7 explicitly promises the opposite. `BatchQcEntry` now carries an `expectations`
snapshot (type, lot number, expected values + tolerances, deep-copied) taken when the material
first enters the batch (create or composition edit; kept entries never re-snapshot), and
`qcExpectationsFor` renders only the snapshot. Decision logged 10 Jul 2026.

### High — bulk-paste preview leaked another organisation's QC code

`previewEntries` built each cell's row label BEFORE validating the target, and `rowLabelFor`
resolved QC codes through the GLOBAL material map — a hand-built preview payload with a foreign
material id got the foreign code echoed back in the rejected cell. `rowLabelFor` now resolves
codes only through the batch's own QC entries (unknown ids echo the raw id), and validation runs
before any label is built. (Invariant 5; the hard-never "never read across organisations".)

### High — import files that cannot be trusted are now rejected loudly

Four structural holes let plausible-but-wrong values import silently (ADR-4's exact "never
guess" class):

- **Duplicate headers** (`Sample;Pb;Cd;Zn;Pb`) resolved to the LAST physical column — wrong
  values, or wrong ROW IDENTITY when the ID column repeats → the file is rejected naming the
  duplicated header (`computeImport`).
- **Row width ≠ header width** (an unquoted decimal comma splits one value into two and shifts
  the rest — narrower OR wider) → all that row's values are rejected with the reason; other rows
  still import (the worksheet path's pass-2 wider-only rule is tightened to exact width, whole-
  sheet fallback as before).
- **Long orientation without a unit declaration**: an analyte missing from `longUnits` imported
  with NO unit check — now its cells are rejected until the unit is declared ("no unit declared…
  factor-1000 guard"), mirroring wide's mandatory per-column unit.
- **Content after a closing CSV quote** (`"1,2"3` → "1,23") was silently absorbed — now a
  structural error, per the parser's own "fail loudly" contract (`lib/batches/import-parse.ts`).

### Medium — corrections/replacements are anchored against concurrent writes

`enterResult` and `replaceCompletedResult` chained the new record onto whatever was current at
submit time: two colleagues correcting the same cell attached the second mandatory reason to a
record its author never saw and wrote a false before-value into the append-only audit event.
Both now take `expectedCurrentRecordId` (the record the dialog displayed; null = empty cell) and
refuse on mismatch with a refresh message — the same pattern as `completeStep`'s concurrency
token. The cell dialog and the replace dialog send the id they render.

### Medium — segregation no longer counts the reviewer's own review acts

With "reviewer must differ" ON, a reviewer's first no-result gap closure made them a
"performing analyst" (`enteredBy` on the record) and permanently blocked their second closure,
every validity decision and completion — AC 4's closure route dead-ended the review. Records
created in reviewer capacity (gap closures, post-completion replacements) now carry
`reviewAct: true` and are excluded from the participation test; bench work (manual entry,
paste, worksheet, import) still counts.

### Medium — the paste path parses the clipboard like the import path

Three geometry bugs could write valid-looking values to the WRONG samples: interior blank lines
were filtered out (shifting all following rows one sample up), quoted cells with embedded
newlines/tabs were split blindly (Excel quotes such cells on the clipboard), and values falling
past the grid edge vanished without a trace. The pasted block is now tokenized by the shared
strict RFC 4180 scanner (tab-delimited, interior blank rows kept, structural errors shown), and
out-of-grid values are counted and shown in the dialog before preview/confirm
(`parseClipboardBlock` in `lib/batches/import-parse.ts`; `results-grid.tsx`).

### Medium — audit trails that US-D5 AC 1 / US-A7 AC 8 demand now exist

- Import configurations: `createdAt`/`createdBy` + an append-only `events` list (equipment
  pattern) written on create, per-field before→after on edit, and on every status change with
  its reason (`statusReason` alone held only the latest).
- Org/lab settings: `SettingsApi` now carries the acting user (resolved server-side), and every
  change appends to `OrgSettings.settingsEvents` with old → new — including the
  reviewer-segregation toggle (whether four-eyes review was ON for a given period is now
  provable) and qualifier renames (which steer how pasted/auto-read text is interpreted).

### Medium — LOQ defaults, auto-read at upload

- **"<LOQ" one click could dead-end**: an LOQ like "1.250" hits the manual-entry ambiguity
  pattern, so AC 4's prefilled boundary was rejected and that exact precision was unrecordable.
  A boundary exactly equal to the analyte's stored LOQ (canonical by construction) is now
  accepted as-is; the parser rule itself is untouched (logged decision).
- **AC 14's "reads it at upload"** now happens: `uploadWorksheet` parses the Results sheet
  immediately and the upload form shows either "Results sheet detected: N readable value(s) —
  review and confirm…" or the fallback notice. Reading never gates the upload; writing still
  goes through preview + confirm.

### Low — smaller fixes

- **Seed coherence**: completed seed batch METB26-0001 violated the completion gate it
  demonstrates (sample × Zn cell had no record and could never be accounted for). A third valid
  sample record is seeded and the completion event's count corrected; store key bumped.
- **Config-shape validation**: two columns mapping ONE analyte, an ID column doubling as an
  analyte column, and long configs whose ID/analyte/value columns collide are rejected at save
  (previously surfaced per-import as misleading "duplicate row" rejections).
- **Import event honesty**: rows whose every cell was deliberately kept are stored (and shown)
  as `kept-existing` instead of "rejected" with an empty reason; genuinely rejected rows
  aggregate their cells' reasons; a long-orientation value with an EMPTY analyte cell is now a
  listed rejection instead of vanishing from the accounting.
- **Physical row numbers**: previews, resolutions and the frozen import event now number rows by
  the row's physical position in the file (header = row 1, blank rows counted), so the stored
  outcomes point at what an auditor sees when opening the stored original.

### Held for Ramazan (not fixed — design decisions)

Eight findings imply a design choice: see `docs/review-progress.md` § "Pass-3 open decisions"
(completion gate vs a bare rejected cell; QC cells outside the completeness gate; Excel number
cells arriving as floats; numeric-looking qualifier names; undeclared Excel sheet selection;
locale display of values; import-configs page lab scoping; refusing an all-skipped confirm
without storing the event).

## Pass 2 — US-B3 equipment · US-D1 create batch · US-D3 step workflow (6 Jul 2026)

Run as a multi-agent review (12 reviewers → duplicate-merge → 3 independent double-checks per
finding → coverage check → targeted round 2). 18 findings confirmed; 14 fixed below; 4 are
design decisions waiting on Ramazan (listed in `docs/review-progress.md`). All fixes verified by
`npx next build` (green) plus 52 behavioral checks against the real lib modules (all passing).

### High — composition latch never flipped by recorded work (US-D1 AC 10)

The one-way composition latch was only set by `completeStep`. Results, worksheet uploads and
instrument imports — all "recorded work" per AC 10 — left it open, so a batch at step 1 with
measured values could still have samples swapped in/out, orphaning measurement records and
silently rewriting the working copy.

- `lib/batches/mock.ts` — `appendRecord` now sets `compositionLatched = true` (one point covers
  manual entry, bulk paste, worksheet auto-read, import confirm); `uploadWorksheet` sets it too.
- Belt-and-braces: `updateComposition`'s gate and `getBatch`'s `compositionOpen` additionally
  check `hasRecordedWork(batch)` (results/worksheets/imports non-empty), so composition can
  never reopen even if a future write path misses the flag.
- Knock-on fix for free: `sampleMethodProgress` derives "work started" from the same flag, so
  per-(sample × method) progress now correctly reads *In progress* once work exists.

### Medium — completed batch outranked an open redo (`lib/batches/progress.ts`)

`sampleMethodProgress` early-returned `completed` when ANY completed batch of the method
contained the sample — so during a structural redo (new open batch, same method) the sample,
job and batch views all said "completed" while bench work was running. Open/awaiting-review
batches now take precedence; `completed` only stands when no open batch of the method holds
the sample.

### Medium — worksheet auto-read sniffed the delimiter (`lib/batches/mock.ts`)

`parseWorksheetEntries` picked whichever of tab/semicolon/comma split the header widest, then
naively `split()` each row — an unquoted decimal comma redistributed a number's fragments
across analyte columns as plausible wrong values. Now parses with the strict RFC 4180
`parseCsv` and a **declared** comma delimiter (the system's own working-copy convention), and
rejects any row wider than the header. Decision logged 6 Jul 2026.

### Medium — asset ID was editable (`lib/equipment/mock.ts` + detail dialog)

`updateEquipment` accepted a new `assetId`, and uniqueness only checked *current* values — a
rename freed the old tag for a brand-new record, the exact reissue the 3 Jul decision forbids.
The ID is now immutable server-side; the edit dialog shows it read-only.

### Medium — voided sample invisible on batch views

A sample voided from the job side rendered as a normal live member on the batch page. The
batch detail sample rows, results grid rows and review rows now carry `voided`, and the
Samples tab, edit-composition dialog, grid and review panel badge/mute it. (Whether voiding
should be *blocked* while the sample sits in an open batch is a pending decision for Ramazan.)

### Medium — composition-edit dead-ends fixed (`validateComposition` learns the held composition)

Two ways an open-window edit could become impossible:

1. A QC entry whose material expired/deactivated after creation was invisible in the dialog yet
   auto-submitted, and the server rejected retaining it → **no** edit possible. Held entries are
   now shown ("no longer offered" badge) and may be kept (same/lower quantity) or removed;
   only adding/increasing needs current eligibility.
2. The server demanded a confirm-add-method for an existing member whose request flag was
   false — a confirmation the dialog can only produce for *newly added* rows. Existing members
   are now exempt (AC 5 scopes the confirmation to adding).

### Medium — job edit could un-request a method mid-run (`lib/jobs/mock.ts`)

`updateJob` wholesale-replaced `requestedMethodIds` with no batch awareness, breaking the
AC 5 membership-implies-requested invariant (stranded member, false remove/re-add churn,
lost job completeness after a void). Removal is now rejected while the sample sits in an open
batch of that method — the mirror of the existing acceptance freeze.

### Low — smaller server-side guards

- `creationOptions` now checks `canSeeLab` like every other read (it returns sample/customer
  data; previously it trusted its `labId` parameter).
- `confirmImport` now re-runs the preview-time config guards **and** refuses when the config
  changed since preview (config JSON frozen on the staged token). Previously an edit in the
  30-minute window was silently applied.
- `releaseClaim` now refuses completed/voided batches like `claimBatch`/`assignBatch` (the UI
  hid the button; the server is the boundary).
- The batch "created" audit event now names the full composition (sample IDs + QC set), and
  composition-changed events record "QC set was: … → now: …" — before/after per invariant 1;
  previously the QC composition at creation was unreconstructable once edited.
- `equipmentForMethodStep` (the exported epic-D gating hook, no consumers yet) now takes a
  `labId` and filters on it, matching the enforced D3 gate; `MethodLinkView` carries `sameLab`
  and both the Methods tab and the links dialog badge lab-moved links.

### Held for Ramazan (not fixed — design decisions)

See `docs/review-progress.md` § "Pass-2 open decisions" for the four findings that imply a
design choice: never-calibrated equipment computing Available; retiring a blocking check type
clearing a Blocked state; voiding a sample/job while it sits in an open batch; equipment
fields optional vs US-B3 AC 2.

## Earlier in this review effort

- `app/(auth)/login/page.tsx` — the demo-accounts box is hidden when the Supabase backend is
  active (`NEXT_PUBLIC_SUPABASE_URL` set): those demo credentials don't exist on the real
  backend, and a login page shouldn't enumerate real accounts.

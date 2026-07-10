# Review changes — running changelog

Every change made by the staged correctness review (see `docs/review-progress.md`), with the
reasoning, written for Steven and future readers. Newest pass first. Each change also carries an
inline comment at the spot in the code; fundamental choices are one-liners in
`docs/decision-log.md`.

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

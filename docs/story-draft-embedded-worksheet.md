# Story draft — Embedded worksheet environment (proposed US-D7)

Drafted 17 Jul 2026 from Ramazan's data-entry redesign decision (see decision
log). **This is a draft for the Notion master** — refine, number and freeze it
there, then re-export. It realises ADR-4 phase 2 (embedded in-app worksheet;
candidate engine: Univer) and supersedes the file-based halves of US-B1 AC 6
and US-D4 AC 9/14.

## Story

As a lab, we want our calculation worksheets to live INSIDE the LIMS instead
of travelling as Excel files, so that every cell-level change to accredited
data is attributable, versioned and reconstructable — traceability must not
depend on what a desktop application did to an uploaded blob.

## Scope

- **Replaces:** method template upload (.xlsx), working-copy download, the
  fill-in-Excel step, completed-worksheet upload + auto-read (US-D4 AC 9/14).
- **Does NOT replace:** instrument-file import (US-D5) — instruments produce
  files regardless; that flow keeps its own strictness (see the 17 Jul
  interim decisions: string-typed cells only, declared sheet name).

## Acceptance criteria (draft)

1. A method (version) defines an **in-app worksheet template**: a grid with
   formulas, fixed cells and designated input/result cells. Templates are
   versioned like today's file templates (invariant 3): editing a template on
   a batch-used method creates a new version; batches pin the version they
   ran under.
2. Creating a batch instantiates the pinned template as the batch's
   **working worksheet** — pre-filled with sample/QC identity cells exactly
   like today's generated working copy. No file is generated or downloadable
   for data entry (a read-only export for printing/archive stays possible,
   clearly marked as a projection).
3. Every cell edit is a recorded act: **who, when, cell, old value → new
   value** — append-only, never overwritten. A correction supersedes with a
   mandatory reason, exactly like grid entry (ADR-2; one shared rule).
4. Designated **result cells feed the measurement records directly** (same
   append-only rows, origin "worksheet"), eliminating the auto-read/confirm
   round-trip: what the reviewer sees in the grid IS what the worksheet
   holds — no divergence check needed because there is only one copy.
5. **Formulas are visible and versioned** with the template; a formula's
   computed value is never hand-editable without an explicit, audited
   override (with reason).
6. Numeric handling follows ADR-4 unchanged: canonical decimal strings, full
   entered precision, exact comparisons, ambiguous input rejected — the
   engine's internal float representation must never leak into stored
   values.
7. Worksheet access follows batch work authorization (US-A4 + clearances);
   read-only roles see, never edit.
8. The **file-based flow is retired** once this ships: US-B1 AC 6 (template
   upload) and US-D4 AC 9/14 (upload + auto-read) are amended; existing
   uploaded templates/worksheets remain readable as historical records
   (never delete).

## Open questions for the Notion session

- Engine choice and licence (ADR-4 names Univer as candidate) — first real
  frontend dependency of this size.
- Offline/bench tablets: does entry need to survive connection loss?
- Migration: do existing file templates get re-authored manually, or is
  there an import assist?
- Phasing: worksheet viewing/entry first, template authoring second?

## Build phasing note

Realistically the largest single feature since epic D. Suggested slot:
after the current triage build, alongside epic E planning — E's QC
evaluation reads the same result cells this feature writes.

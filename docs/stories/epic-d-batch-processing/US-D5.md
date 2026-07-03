# US-D5 — Instrument import

*Status: written with Fable 5 — globally reviewed by Ramazan & frozen 2 Jul 2026 (deep catches during build via the amendment route) · build: phase 3 (epic D)*
> **User story**
> As an analyst, I want to import an instrument's export file into a batch through a configurable mapping with a full preview, so that results land in the system without retyping — every value validated, every row accounted for, and the original file kept as proof.

*Scope note: this is layer 1 of the two-layer import model (scope note §6 ✅): one generic, configurable import that reads tabular exports (CSV/Excel). Layer 2 — custom parsers for exotic per-instrument formats — is a later onboarding service (see Later). Import shares the result model and validation with US-D4 and the QC-code matching designed in US-B2 AC 2 / US-D1 AC 7.*
**Acceptance criteria**
1. **Import configurations** are lab-level masterdata managed by Admin/Lab manager. A configuration defines: name, file type (CSV or Excel), 🆕 orientation — **wide** (one row per sample, one column per analyte) or **long** (one row per measurement: ID, analyte, value) — the column mapping (which column carries the sample/QC ID; per analyte column: analyte name + unit), and the **declared decimal separator** (ADR-4: declared, never auto-detected). Configurations are deactivated, never deleted; changes are audited with before/after.
2. Import is available on an open batch in the same window as manual entry (US-D4 AC 1) and is **per batch** (scope note §6: one run ≈ one batch; multi-batch routing is Later).
3. **Flow: file + configuration → parse → preview → confirm.** Nothing is written before confirm. The preview shows, per row: the matched sample or QC entry, per-cell parsed values, and every problem explicitly (AC 5–7).
4. **Matching:** a row's ID cell resolves to the batch's samples (sample ID) or QC entries (material code, case-insensitive — US-B2 AC 2). 🆕 All rows with the same QC code attach to that one QC entry; the preview shows the row count against the entry's quantity (US-D1 AC 7) — a mismatch is a notice, never a block. A row matching nothing in the batch must be **resolved** (manually mapped) or **explicitly skipped with a reason**; an ID that belongs to a sample outside this batch is shown as such and can only be skipped. Confirm stays blocked while unresolved rows remain.
5. **Value handling (per cell, ADR-4 + US-D4 AC 5):** numeric parsing follows the declared separator; a value that is ambiguous under the declared rule is **rejected**, never guessed; thousands separators are rejected; 🆕 censored notation ("<x", ">x") is parsed into proper censored values. Any other unparseable content is rejected with a reason. **Rejected cells do not block the rest:** valid cells import, rejected ones stay empty for manual follow-up and are listed in the preview and the import summary.
6. 🆕 **Unit safety:** each mapped analyte column's unit must equal the method analyte's unit (US-B1 AC 3); a mismatch is a **hard error** for that column — its cells are rejected with the reason shown. (A silent mg/L-vs-µg/L slip is a factor-1000 error; this is the guard.) An analyte column the batch's method does not have is ignored with a notice (instruments often measure more than the method reports); method analytes absent from the file simply stay empty — completeness is review's job (US-D6).
7. **Conflicts:** where a cell already holds a value, the preview marks the conflict; the default is **keep existing**. The user can opt in to replace (per cell or all conflicts), which creates supersede records (ADR-2) with a **mandatory reason** entered once at confirm and recorded on each superseded value.
8. **Source file & snapshot (ADR-3):** on confirm — and before any record is written — the original file is stored immutably at the **import event** with its SHA-256 checksum, together with a snapshot of the applied mapping, the actor, the timestamp, and the per-row outcomes (imported / skipped + reason / rejected + reason). The import summary stays viewable from the batch (Files/History).
9. Confirmed values become measurement records with origin `import`, status `entered`, referencing the import event — one model with manual and worksheet entry (US-D4 AC 11).
10. Every import event, record and supersede is written to the append-only audit log with the organisation context.
**Developer decisions (this story)**
- **Choose here:** the parser approach per file type (CSV dialects, Excel reading) and the storage shape of the import-event snapshot. Requirement that must hold: AC 8 — an import must be reproducible/explainable from the event alone.
- *Non-binding advice:* store the effective mapping as a JSON snapshot on the event; parse Excel server-side via a standard library, never by round-tripping through anything interactive.
- **Log it:** one line per choice in the Decision log.
**Frontend (UI)**
```plain text
Import into MAINB26-0007        config: [ ICP export (wide) ▾ ]  file: run_0207.csv
──────────────────────────────────────────────────────────────────
Preview — 23 rows · 20 matched · 2 QC · 1 unresolved
  MAIN26-00012.001   Pb 12.4   Cd 0.82   Zn 3.1            ✓
  MAIN26-00012.002   Pb <0.010 Cd 0.79   Zn 1,2 ✗ ambiguous ⚠ 1 cell
  BLK (2 rows / ×2)  Pb <0.010 Cd <0.005                    ✓
  UNKNOWN-17         —  not in this batch   [ map ▾ ] [ skip + reason ]
──────────────────────────────────────────────────────────────────
Conflicts: 3 cells already have values   (•) keep  ( ) replace + reason
Unit check: Zn column declared mg/L = method ✓
                        [ Cancel ]   [ Confirm import ]  (blocked: 1 unresolved)
```
**Authorization**
- **Import** — Admin, Lab manager, and Analysts cleared for the batch's method (same as US-D4).
- **Manage import configurations** — Admin and Lab manager (within their lab).
- **Read-only** — can view import summaries, never import.
- All enforced server-side (invariant 4).
**Definition of Done**
- All acceptance criteria met and verifiable.
- Separator behaviour tested: declared-comma file, declared-dot file, ambiguous value rejected, thousands separator rejected.
- Wide and long orientations both tested end to end.
- QC matching tested: multiple rows on one code attach to one entry; count-vs-quantity mismatch shows as notice.
- Unresolved row blocks confirm until mapped or skipped-with-reason; out-of-batch ID only skippable.
- Unit-mismatch column hard-fails; unmatched analyte column ignored with notice.
- Conflict flow tested: default keep; replace creates supersedes with the reason on each.
- Source file + checksum + mapping snapshot + row outcomes stored before records; import reproducible from the event.
- Per-cell rejection leaves valid cells imported.
- Closed during *Awaiting review*; lab/organisation isolation verified.
- Everything in the audit log.
**ISO 17025 / compliance**
- **§7.5** — the export file is the original observation record: stored first, immutable, checksummed; every parsed value points back to it.
- **§7.11** — controlled, validated data transfer — exactly the clause auditors probe on instrument interfaces.
- **ALCOA+** — *Original & Accurate*: no guessing, no silent unit slips, full row accounting.
**Later (Part 11 / growth)**
- **Layer 2:** custom parsers for exotic per-instrument formats — an onboarding service and selling point (scope note §6).
- Multi-batch run routing with QC position IDs (deliberately parked).
- Direct instrument interfaces / watched folders (auto-intake instead of manual file pick).
- Dialect suggestions in the config screen (suggest, never silently apply).

## Changelog — new story (source: epic D scope note §6)
- **New story.** Implements the decided two-layer model ✅ (layer 1 here; layer 2 = Later/onboarding), Ramazan's **QC-code matching** ✅ (rows match the batch's QC entries by material code — no naming conventions, no position IDs), the per-batch import rule ✅, and ADR-3/4 verbatim (source file first, declared separator, reject-never-guess).
- New decisions on top, to review: (1) **per-cell rejection** — valid cells import, bad cells stay empty and listed (mirrors the D4 paste preview; alternative whole-row rejection punishes 19 good values for 1 bad one); (2) **unit mismatch = hard error per column** — the factor-1000 guard; unmatched analyte columns are merely ignored with notice, since instruments often measure more than the method reports; (3) **conflicts default to keep-existing**, replacing is opt-in and becomes supersedes with one operation-level reason; (4) **config snapshot on the import event** instead of full configuration versioning — traceability without the masterdata weight; (5) censored notation ("<x") parsed natively in layer 1.
- Developer decisions registered: parser approach + snapshot shape (advice: JSON snapshot on the event).

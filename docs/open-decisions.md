# Open decisions — DECIDED 17 Jul 2026, ALL BUILT 21 Jul 2026

**All 16 items were triaged by Ramazan on 17 Jul 2026 — the recommended
option was chosen on every item** (for #7 additionally: data entry moves to an
embedded in-app worksheet, see docs/story-draft-embedded-worksheet.md; the
string-cells-only rule is the interim). One consolidated decision-log entry
records all 16.

**Build status (21 Jul 2026): every item is closed.** Items 4, 10 and 16 were
log/amendment-only (Notion amendment G covers 4 and 10; 16 confirms the
existing manager-only recovery). The decisions were recorded in 52a9734; the
other 13 items shipped in five build commits:

| Commit | Items | Content |
| --- | --- | --- |
| 6486e0e | 1, 2 | calibration "none" blocks availability; retiring/re-scheduling a blocking check type refuses |
| 628a50e | 3 | voidJob/voidSample refuse while a live sample sits in an unfinished batch |
| 3beccc9 | 5, 6 | completion gate: rejected cells block with a closure route; QC cells join the gap list and closeGapNoResult |
| 1721396 | 7 (interim), 8, 9, 12 | string-cells-only xlsx reading; qualifier-name guard + ambiguous-cell rejection; declared sheet name; all-skipped confirm stores the import event |
| 4039b78 | 11, 13, 14, 15 | import configs under the masterdata exemption; step-filter union; unassigned-filter symmetry; QC-code collision guard |

Item 7's redesign itself is the proposed US-D7 story draft
(docs/story-draft-embedded-worksheet.md), to be frozen in Notion.
Verification at close-out: 70/70 tests on both seed projects, tsc and eslint
clean.

The 16 design decisions parked during review passes 2–4, one line each for triage in one
sitting. Headlines are verbatim from `docs/review-progress.md`, which holds the full options
and reasoning per item (sections "Pass-2/3/4 open decisions"); the recommended option is
noted as (rec: …). None are blocking; all are built-on-decision.

**Pass 2 (6 Jul 2026)**

1. **Never-calibrated equipment computes Available and passes D3 step gating** (high) — rec: treat calibration "none" as a blocking reason, mirroring the never-performed-check decision.
2. **Retiring a check type (or re-scheduling it to per-use) clears an active Blocked state** (medium) — rec: refuse retiring/re-scheduling a check type that is currently the source of a blocked reason.
3. **voidSample/voidJob succeed with no warning while the sample sits in an open batch** (high) — rec: block the void while the sample is in an open/awaiting-review batch, pointing to the sanctioned exits.
4. **Manufacturer, model, serial number and location are optional on create/edit** (low) — decide: make the four fields required server-side, or log the relaxation as deliberate.

**Pass 3 (10 Jul 2026)**

5. **Completion gate accepts a bare rejected cell** (high — AC 6 vs AC 5 tension) — rec: enforce AC 6 literally (a current-rejected cell blocks completion, with a closure route for the reviewer).
6. **The completeness gate ignores QC cells** (medium) — rec: include QC entries in the gap list and let closeGapNoResult accept QC targets.
7. **Excel number cells import through a float** (high) — rec: accept only string-typed cells; reject number/date/formula cells per cell with reason.
8. **Numeric-looking qualifier names reinterpret instrument text** (high) — rec: forbid number-like qualifier names in updateList AND reject ambiguous cells at interpretation.
9. **Excel import reads `worksheets[0]`, undeclared and unvalidated** (high) — rec: declare the sheet name in the import configuration and refuse when absent.
10. **AC 6's locale display is not implemented** (low) — rec: log the deviation and amend AC 6 via the Notion route.
11. **Import-configs page scopes to the active lab** (low) — rec: extend the 4 Jul masterdata exemption using the QC-materials lab-resolution pattern. *(More urgent since 13 Jul: admins carry no lab assignments.)*
12. **An all-skipped/all-rejected confirm refuses before storing the import event** (low) — rec: store the event (file, checksum, snapshot, row outcomes) even when nothing applies.

**Pass 4 (13 Jul 2026)**

13. **The step filter cannot express steps of older pinned versions or deactivated methods** (medium) — rec: union the dropdown with the distinct current-step names of the actually listed open batches.
14. **Assignee=Unassigned always excludes finished batches** (low) — rec: drop the active-only requirement from the row predicate (keep it in the AC 5 pool count).
15. **Should the composition edit that CREATES a QC-code collision be blocked?** (sub-question, pass-4 G1 fix) — rec: block adding a material whose code collides with a held entry.
16. **Should a batch whose assignee can no longer act auto-return to the open pool (or become claimable)?** (sub-question, pass-4 G3 fix) — rec: keep manager-only recovery (assignment changes stay deliberate, audited acts).

---

*Adjacent observation — resolved 17 Jul 2026:* the repo now has a persistent **Vitest invariant
suite** (`tests/invariants/`, `npm test`, both seed modes). The review passes' ~121 scratch-harness
checks were never committed; porting the valuable ones into the suite is optional follow-up.

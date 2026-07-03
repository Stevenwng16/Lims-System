# US-D4 — Manual data entry

*Status: written with Fable 5 — globally reviewed by Ramazan & frozen 2 Jul 2026 (deep catches during build via the amendment route) · build: phase 3 (epic D)*
> **User story**
> As an analyst, I want to enter final results per sample and analyte in one place, with the system guarding value types, notation and every correction, so that what ends up in the record is exactly what was determined — original, attributable and traceable.

*Scope note: this story is the manual entry path of the ADR-2 result model. Instrument import shares the same model and lands in US-D5; validity decisions (valid/rejected) belong to review, US-D6; comparison against QC expectations and acceptance criteria is epic E. Per the scope note (§5, option B): no step-level input fields in the MVP — intermediate values live in the worksheet, which this story anchors to the batch.*
**Acceptance criteria**
1. On an open batch, authorised users enter results in a **grid**: one row per client sample and per QC entry (same model, ADR-2), one column per analyte of the pinned method version, each column showing the analyte's fixed unit (US-B1 AC 3). Entry is available from batch creation until the batch reaches *Awaiting review* (AC 10) and never on a voided or completed batch.
2. A cell value is one of the ADR-2 value types: **numeric**; **censored** — qualifier `<` or `>` plus a numeric boundary; **qualitative/text**; or **no result** with a mandatory reason (also the close-out for a sample that cannot continue mid-run, US-D1 AC 10 / US-D3 AC 7).
3. Besides the fixed `<` and `>`, the qualifier picker offers the organisation's configurable qualifier list 🆕 (default contains "n.b."; managed in Settings, US-A7 AC 9). Deactivating a qualifier never touches historical results.
4. 🆕 When `<` is chosen and the analyte has a reporting limit (US-B1 AC 3), the boundary **defaults to that LOQ** (editable) — "<LOQ" in one click, the everyday case.
5. **Parsing & validation (server-side, ADR-4):** numeric input is locale-aware and accepted only where unambiguous — ambiguous input is rejected with a clear message, never guessed; thousands separators are rejected; a censored value requires a numeric boundary; *no result* requires a reason. Deliberately **not** validated here: agreement with QC expectations or acceptance criteria — that is epic E's judgement, not entry's.
6. Values are stored canonically (decimal point, **full precision as entered**); the grid displays them per the user's locale. Rounding never happens at entry — reporting precision (US-B1 AC 3) applies at reporting (epic F), with the system-wide round-half-up rule.
7. Every saved cell is an **append-only measurement record** carrying its links (batch, sample or QC entry, analyte, method version), the value, origin `manual`, and automatic attribution (who, when) — nothing about it is hand-editable afterwards.
8. **Correction = supersede:** changing a saved value creates a new record with a **mandatory reason**; the old record is never altered and stays reachable — the grid shows the current value with a correction indicator (⟳) that unfolds the full chain (who, when, why, each version).
9. 🆕 **Worksheet gate (ADR-3, moment 2):** the completed worksheet must be attached to the batch (Files tab, attachment facility) **before the final step can be completed** — the transition to *Awaiting review* (US-D3 AC 5) is blocked until it is present. Uploading can happen at any earlier moment; replacing it creates a new version (never overwrite).
10. 🆕 During *Awaiting review* the grid is **closed**: the reviewer judges a stable snapshot. Missing or wrong data during review is resolved by a set-back (US-D3 AC 6), which reopens entry.
11. Manual, worksheet-read (AC 14) and imported (US-D5) results coexist in one model: any can supersede any, always with a reason; the origin (`manual` / `worksheet` / `import`) stays visible per record.
12. Every measurement record and every supersede is written to the append-only audit log with the organisation context.
13. 🆕 **Bulk paste:** a rectangular block copied from a spreadsheet can be pasted into the grid. The system parses it with exactly the AC 5 validation and shows a per-cell preview (accepted values, rejected cells with reasons); records are written only on confirm, and rejected cells stay empty for manual handling.
14. 🆕 **Results-sheet auto-read:** if the uploaded worksheet (AC 9) contains the standard **Results sheet** (template convention, US-B1 AC 6: a sample/QC-ID column plus one column per analyte), the system reads it at upload and prefills the grid as a pending preview under the same AC 5 validation; the user reviews and confirms before any record is written. Records confirmed this way carry origin `worksheet`, referencing the exact worksheet version. A missing or mismatching Results sheet falls back to manual entry or paste with a clear notice — auto-read is a convenience, never a gate.
**Developer decisions (this story)**
- **Choose here:** the measurement-record event structure — this story creates the first ADR-2 records (ADR-2, open question 3) — and the numeric storage type/precision strategy.
- *Non-binding advice:* status column on the record + transitions as audit events (the ADR-2 proposal); a decimal type with generous scale — never a float.
- **Log it:** one line per choice in the Decision log.
**Frontend (UI)**
```plain text
Batch MAINB26-0007 — results                     entry open · 42/60 filled
────────────────────────────────────────────────────────────────────
              Pb (mg/L)      Cd (mg/L)      Zn (mg/L)
MAIN26-00012.001   12.4          0.82           3.1
MAIN26-00012.002   [ <  ▾][0.010]  ⟳ 0.79        n.b.
BLK  ×2            <0.010         <0.005         —
CS1                49.7           1.02           10.3
────────────────────────────────────────────────────────────────────
Worksheet: ✓ attached (v1, checksum ...)     [ Upload new version ]
qualifier ▾ : <   >   n.b.   (org list)      reason required on change
```
**Authorization**
- **Enter / correct** — Admin, Lab manager, and Analysts cleared for the batch's method (US-A4 AC 6); identical for QC rows.
- **Read-only** — sees the grid and correction chains, changes nothing.
- Server-side enforced (invariant 4); clearance is checked at the moment of action (US-A6 AC 4).
**Definition of Done**
- All acceptance criteria met and verifiable.
- Parsing tested: comma and dot locales, ambiguous input rejected, thousands separators rejected, full-precision storage round-trips exactly.
- Qualifier flows tested: fixed `<`/`>` with boundary, LOQ default, org-list qualifier, deactivated qualifier retained on historical results.
- Supersede tested: reason mandatory, chain complete and ordered, origin preserved, manual↔import supersede both ways.
- *No result* requires and records a reason.
- Worksheet gate tested: final step blocked without attachment, unblocked after upload, replacement versions retained.
- Entry closed during *Awaiting review*; reopened by set-back.
- Rights tested incl. an uncleared analyst being blocked server-side.
- All records and supersedes in the audit log.
**ISO 17025 / compliance**
- **§7.5** — original observations recorded at the time they are made, with the completed worksheet preserved as the raw calculation record.
- **§7.11** — controlled data entry: validation, attribution, audit.
- **ALCOA+** — *Original, Accurate, Contemporaneous, Attributable*; corrections keep the original (RvA re-analysis practice: the first result never disappears).
**Later (Part 11 / growth)**
- 🆕 Embedded in-app worksheet (phase 2, ADR-4): the method template as an in-app sheet with live formulas; designated result cells flow straight into the result model. Route: an embeddable spreadsheet SDK (candidate: Univer, Apache-2.0) instead of building a formula engine.
- Direct capture from balances/instruments into step-level fields (scope note §5 — arrives with the B3 integration or the phase-2 calculation engine).
- Per-step entry windows (US-D3 Later).
- Electronic signature on entry/correction.

## Changelog — new story (source: epic D scope note)
- **New story.** The ADR-2 result model made concrete for manual entry; consumes the decided qualifier model (fixed `<`/`>` + org list, default "n.b." ✅), option B (no step input fields ✅ — worksheet carries intermediates), ADR-4 notation rules, and B1's LOQ.
- Key decisions to review: (1) **entry closes during *Awaiting review*** — the reviewer judges a stable snapshot; a set-back reopens (alternative: allow entry during review — rejected as it makes review a moving target); (2) worksheet gate at final-step completion — ADR-3 moment 2 gets one clear enforcement point; US-D3 AC 5 amended with the cross-reference; (3) **`<`** defaults its boundary to the analyte's LOQ — the everyday case in one click; (4) the qualifier list gets its home in US-A7 AC 9** (third organisation list — deliberate amendment, same route as the earlier two); (5) bulk clipboard paste parked under Later — say the word if transcription pain makes it MVP-worthy.
- Developer decisions registered: measurement-record event structure (ADR-2 open question 3 lands here) and numeric storage type (advice: decimal, never float).
- **Convenience decisions (2 Jul 2026, after market/component research):** (1) **AC 13 bulk paste** and (2) **AC 14 Results-sheet auto-read** pulled into the MVP — together with US-D5 they make transcription the exception instead of the rule (daily flow: fill worksheet → upload → confirm preview). The Results-sheet template convention lands in US-B1 AC 6. (3) Origin gains a third value `worksheet` — a conscious refinement of ADR-2's manual/import pair, keeping provenance honest. (4) The embedded in-app worksheet (the "built-in Excel" of the big LIMS packages) is concretised as **phase 2 in ADR-4** with a named route (embeddable spreadsheet SDK, candidate Univer / Apache-2.0) — flagship feature after the first paying customer, not MVP.

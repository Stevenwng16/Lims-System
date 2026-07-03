# US-B1 — Method management

*Status: written with Opus 4.8 — reviewed with Fable 5, amended & approved 1 Jul 2026 · build: phase 2 (first story of the phase)*
> **User story**
> As an administrator or lab manager, I want to define analytical methods with their process steps, analytes and data-entry template, so that batches run a consistent, traceable workflow that matches our lab's procedures.

*Scope note: a method belongs to exactly one lab, which belongs to one organisation (invariant 5); method visibility never crosses the organisation boundary. This story manages methods and their versions; clearances per user live in User management (US-A6), equipment links in Equipment (US-B3), acceptance criteria in US-B4, and the data-entry workflow that runs these steps in epic D.*
**Acceptance criteria**
1. Admins and lab managers can view a list of methods showing name, code, lab, number of process steps, number of analytes, accredited flag and status (active/inactive). Lab managers see methods in their own lab(s); admins see all methods in their organisation.
2. A method is created with: name, a unique code, the lab it belongs to, and an optional description. The code is unique **within the organisation** (two different customer organisations may both use a code "ICP-W").
3. **Analytes / parameters:** the method defines one or more parameters it determines, each with a name, a unit, a reporting precision (number of decimals), and 🆕 an optional **reporting limit (LOQ)** — the threshold used for censored values ("<x", ADR-2), the Blank comparison in epic E (US-B2 AC 3) and "<x" display on reports (epic F). Analyte names and units are free configuration — no fixed list. Reporting precision is set per analyte here; the rounding *rule* itself is one fixed system-wide rule (round half up, ADR-4), not per-analyte or per-organisation. *(e.g. an "ICP-OES metals in water" method defines Pb, Cd, Zn in mg/L at 3 decimals; a "pH" method defines one parameter with no unit at 2 decimals.)*
4. **Process steps:** the method defines an ordered list of process steps a batch passes through (minimum one step). Steps can be added, renamed, reordered and removed while editing. This ordered list drives the batch workflow and the advance/set-back transitions in epic D. 🆕 The step model must additionally allow **per-step input-validation rules** (e.g. a target value ± tolerance for a weighing step) to be attached later; their exact shape is decided in the epic D scope note (interview: "±10 g"). Designed now as a hook, mirroring the equipment link in AC 8. *(e.g. Sample prep → Digestion → Measurement → Review → Report — fully configurable per lab.)*
5. **Capacity:** the method specifies a maximum number of samples per batch (≥ 1), used when composing batches in epic D.
6. **Data-entry template:** each method has one data-entry template (a spreadsheet template) defining how results are captured. When a batch is created (epic D) the system generates a working copy from this template. The template is stored via the central attachment facility (ADR-3) and **each template version carries a checksum (ADR-4)**, so it is provable which template a batch was calculated with. The template can be replaced; replacing it creates a new template version and does not alter copies already generated for existing batches. 🆕 On a method that has already been used, replacing the template follows the versioning rule of AC 9: it creates a new **method version**, and every method version pins exactly one template version — so a method version fully determines the procedure, template included (§8.3). 🆕 A template may include the standard **Results sheet** (fixed layout: a sample/QC-ID column plus one column per analyte of the method); when present, US-D4 AC 14 auto-reads it at worksheet upload — optional per template, absence simply means manual entry or paste.
7. **Accreditation flag:** each method carries an **accredited (yes/no)** flag, default off. This flag is stored here; it drives report marking in epic F (results from non-accredited methods are flagged on the report and the RvA accreditation mark is applied correctly). This story owns the flag; epic F owns the report logic. *(RvA ASR/INF.)*
8. **Equipment association (design hook):** the process-step model must allow linking one or more required equipment types to a step. This is populated once the Equipment register exists (US-B3) and drives equipment-gating in epic D. The relation is designed now so it can be filled later without rework — no equipment selection is required in this story yet.
9. **Versioning for traceability:** a method already used by one or more batches cannot be silently altered. Editing such a method creates a new version; existing batches keep referencing the exact version they ran under, so it stays provable which procedure produced a given result. The latest active version is used for new batches.
10. **Deactivate, never delete:** a method can be set inactive (no longer selectable for new batches) but is never deleted; all historical batches and their method version remain intact. An inactive method can be reactivated.
11. Validation: code unique within the organisation, at least one process step, at least one analyte, max samples ≥ 1, every analyte has a unit (or explicit "no unit") and a reporting precision. Invalid methods cannot be saved.
12. Method clearances (US-A6) are granted per method. Deactivating a method leaves existing clearance records intact for the audit trail.
13. Every method action (create, edit → new version, activate/deactivate, accreditation-flag change, template replacement) is written to the append-only audit log with the organisation context, recording who did it, what changed (before/after for edits) and when.
**Developer decisions (this story)**
- **Choose here:** the file-storage mechanism behind the central attachment facility — this is the first story that stores files (templates, AC 6). Requirements (immutability, checksum, tenant-separated prefixes) and menu: ADR-3.
- *Non-binding advice:* Azure Blob Storage — its built-in immutability and versioning fit the requirements directly.
- **Log it:** one line in the Decision log.
**Frontend (UI)**
```plain text
Admin ▸ Methods                                         [ + New method ]

Name                       Code    Lab   Steps  Analytes  Accred.  Status
──────────────────────────────────────────────────────────────────────────
ICP-OES metals in water    ICP-W   ENV     5       3        ✓       Active
pH                         PH      ENV     3       1        ✓       Active
Moisture content           MOIST   MAIN    4       1        –       Inactive
```
```plain text
Edit method — ICP-OES metals in water           Version 2 (active)

  Name        [ ICP-OES metals in water     ]
  Code        [ ICP-W ]      Lab [ Environmental lab ▼ ]
  Description [ Trace metals by ICP-OES                 ]
  Accredited  [x]   Max samples per batch  [ 40 ]

  Process steps                              (drag to reorder)
    1. Sample prep        [edit] [x]
    2. Digestion          [edit] [x]
    3. Measurement        [edit] [x]
    4. Review             [edit] [x]
    5. Report             [edit] [x]
    [ + Add step ]

  Analytes / parameters
    Name     Unit     Decimals   LOQ (opt.)
    Pb       mg/L       3        0.010        [x]
    Cd       mg/L       3        0.005        [x]
    Zn       mg/L       2        —            [x]
    [ + Add analyte ]

  Data-entry template   [ icp-w_template.xlsx · v2 · checksum ✓ ]   [ Replace ]
```
**Authorization**
- **Admin** — full method management across all labs of their organisation.
- **Lab manager** — create and manage methods within their own lab(s).
- **Analyst / Read-only** — view methods only; no editing.
**Definition of Done**
- All acceptance criteria met and verifiable.
- Global invariants honoured and tested where applicable (append-only audit with before/after, versioning instead of update-in-place, deactivate-not-delete, server-side enforcement, organisation isolation).
- Configurable steps/analytes/units verified with at least two very different methods (multi-analyte ICP vs single-parameter pH).
- Versioning verified: editing a used method creates a new version and existing batches still point to the old one.
- Code-uniqueness verified within the organisation (same code allowed in two different organisations).
- Template stored via the central attachment facility with a per-version checksum; checksum recorded and retrievable.
- Equipment-association relation exists in the data model (even though unused until US-B3).
- Accreditation flag stored per method and exposed for epic F to read.
- All method actions appear in the audit log with before/after on edits.
**ISO 17025 / compliance**
- **§7.2** — selection, verification and validation of methods: methods are formally defined and controlled.
- **§8.3** — control of documents: method versioning gives controlled, identifiable versions; the template checksum evidences which document version was used.
- **§7.5** — technical records: it stays traceable which method version produced a given result.
- **RvA ASR/INF** — the accredited flag is the system-side anchor for correct accreditation marking on reports (logic in epic F).
**Later (Part 11)**
- Full method version control with electronic-signature approval and a draft → review → approved → effective change-control workflow.
- Link each method version to its controlled SOP document and method-validation records.
- Effective-date scheduling (a new version becomes active on a set date).
- Per-method rounding override, if a standardised method ever prescribes a different rule than the system-wide default.

## Changelog vs v1 (was: US-B1)
- **Cross-references renumbered** to v2: Lab management = US-A5, User management / clearances = US-A6, equipment = US-B3, QC = US-B2, acceptance criteria = US-B4, batch workflow = epic D.
- **AC 2 — code uniqueness scoped to the organisation** instead of system-wide (ADR-1 / invariant 5), same fix as labs in US-A5.
- **AC 3 — rounding made explicit:** reporting precision stays per analyte (unchanged), and the rounding *rule* is one fixed system-wide rule, **round half up** (ADR-4). Not per-organisation configurable; a per-method override is parked under Later. (Decision confirmed in review.)
- **AC 6 — template hardened:** stored via the central attachment facility (ADR-3) and checksum per version (ADR-4) — provable which template calculated a batch.
- **AC 7 (new) — accreditation flag** per method (field only; report logic → epic F). Source: review (RvA ASR/INF). Decision: field now, report logic later in F.
- **AC 13 / list / DoD — organisation context** added to audit and visibility (invariant 5).
- **Deliberately unchanged:** process-step model, capacity, the equipment design hook, versioning, deactivate-not-delete, method clearances, and both UI sketches (sketch only gained the Accredited checkbox and the template checksum line).
- **Fable 5 review (1 Jul 2026) — approved with three amendments:** (1) **AC 3:** optional **reporting limit (LOQ)** per analyte — closes a real gap: US-B2 AC 3 (Blank = "below limit"), censored values (ADR-2, "<x") and "<x" report display all assumed a threshold that was defined nowhere; it belongs here because the LOQ is a property of the method-analyte. (2) **AC 4:** per-step **input-validation hook** (the "±10 g" interview point), shaped in the epic D scope note — mirrors the AC 8 equipment-hook pattern. (3) **AC 6:** template replacement on a used method **creates a new method version**, and each method version pins exactly one template version — keeps §8.3 document control unambiguous (a method version now fully determines the procedure). Everything else confirmed as written.
- **AC 5 clarified (2 Jul 2026, Ramazan):** capacity counts **positions** (client samples + QC), not client samples only — from bench practice: capacity is a physical run limit and QC occupies positions like any sample. Consumed by US-D1 AC 6/7.
- **AC 6 extended (2 Jul 2026, D-scope):** standard **Results sheet** template convention (sample/QC-ID column + analyte columns), enabling auto-read at worksheet upload (US-D4 AC 14). Optional per template.

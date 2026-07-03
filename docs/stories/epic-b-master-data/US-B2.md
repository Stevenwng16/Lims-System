# US-B2 — QC sample database

*Status: written with Opus 4.8 — reviewed with Fable 5, amended & approved 1 Jul 2026 · build: phase 3 — deliberately after epic C, just-in-time before epic D (see phase table)*
> **User story**
> As an administrator or lab manager, I want to maintain a database of quality-control materials with their expected values, so that QC samples can be added to batches and their results automatically checked against known values.

*Scope note: a QC material belongs to a lab within one organisation (invariant 5); visibility never crosses the organisation boundary. This story stores QC materials and their expected values; the actual pass/fail comparison against measured results lives in epic E, and adding QC to a batch happens in epic D. The three material types are fixed because each carries its own comparison behaviour the system must know.*
**Acceptance criteria**
1. Admins and lab managers can view a list of QC materials showing name, type, lot number, number of analytes, expiry date and status (active/inactive). Lab managers see materials in their own lab(s); admins see all materials in their organisation.
2. A QC material is created with: name, 🆕 a short **code** used on instrument sequences and in imports (e.g. "BLK", "CS1"; unique per lab among active materials, matched case-insensitively at import — US-D5), **type** (Blank / Control standard / Certified reference material), the lab it belongs to, optional supplier, **lot number** and **expiry date** 🆕 (both required for Control standards and CRMs; optional for Blanks, which are often prepared fresh), an optional certificate reference/attachment (stored via the central attachment facility, ADR-3), and an optional description. Within each type a lab can create unlimited materials.
3. **Type determines comparison behaviour** (this is why the type set is fixed, not free configuration):
	- **Blank** → expected "below limit"; no numeric target. Epic E tests against the method's **reporting limit (LOQ)** per analyte 🆕 (US-B1 AC 3).
	- **Control standard** → a known value per analyte with a tolerance; epic E tests within ± tolerance.
	- **CRM (certified)** → like a control standard, but with a certificate, certified value and (later) stated uncertainty; this is what carries metrological traceability (§6.5 / ISO 17034).
4. **Expected values per analyte:** for each analyte the material characterises, the material stores an expected (or certified) value, a unit, and an **acceptance tolerance** expressed as either an absolute ± or a percentage (chosen per analyte). Analyte names and units are free configuration, consistent with US-B1. A Blank stores an expected "below limit" rather than a numeric target.
5. These expected values and tolerances are what the QC auto-check in epic E uses to mark a measured QC result pass/fail. This story stores them; the comparison logic itself lives in epic E.
6. **Expiry handling:** each material has an expiry date and the list clearly flags expired and soon-to-expire materials. (Design hook: when composing a batch in epic D, expired materials cannot be selected; the block is enforced there, the expiry data lives here.)
7. **Lots and edits for traceability:** a replacement or new lot of the same material is entered as a new record rather than overwriting the old lot, so each lot keeps its own values and history. Editing a material that has already been used in a batch is allowed but recorded with before/after, and existing batch QC records keep the exact values they were checked against.
8. **Deactivate, never delete:** a material can be set inactive (not selectable for new batches) but is never deleted; historical batch QC records stay intact. An inactive material can be reactivated.
9. **Relevance:** when QC is added to a batch in epic D, only materials that are active, not expired, in the right lab, and that cover one or more of the method's analytes are offered. 🆕 "Covering" means the material holds an expected value for an analyte whose **name matches the method's analyte (case-insensitive) and whose unit matches**; matching is name-based in the MVP — a shared analyte registry is a considered refinement (see Later).
10. Validation: a Control standard or CRM has at least one analyte with an expected value; tolerance ≥ 0; expiry is a valid date and is required for Control standards and CRMs 🆕. Invalid materials cannot be saved.
11. Every QC-material action (create, edit with before/after, activate/deactivate, lot addition) is written to the append-only audit log with the organisation context, recording who, what and when.
**Frontend (UI)**
```plain text
Admin ▸ QC materials                                    [ + New QC material ]

Name              Type               Lot        Analytes  Expiry       Status
──────────────────────────────────────────────────────────────────────────────
Metals mix 1      Control standard   MM-2026-A     3       2027-03-01   Active
Reagent blank     Blank              —             —       —            Active
River sediment    CRM (certified)    NIST-2782     5       2028-11-30   Active
Metals mix 1      Control standard   MM-2025-D     3       2026-04-01   Inactive (exp.)
```
```plain text
Edit QC material — Metals mix 1

  Name        [ Metals mix 1            ]
  Type        [ Control standard    ▼ ]   Lab [ Environmental lab ▼ ]
  Supplier    [ Acme Standards          ]
  Lot number  [ MM-2026-A ]   Expiry [ 2027-03-01 ]
  Certificate [ cert_MM-2026-A.pdf ]  [ Replace ]

  Expected values
    Analyte   Value    Unit     Tolerance
    Pb        5.0      mg/L      ± 0.3        [x]
    Cd        2.0      mg/L      ± 5 %        [x]
    Zn        10.0     mg/L      ± 0.5        [x]
    [ + Add analyte ]

  Status      (•) Active    ( ) Inactive

                                      [ Cancel ]   [ Save ]
```
**Authorization**
- **Admin** — full QC-material management across all labs of their organisation.
- **Lab manager** — create and manage QC materials within their own lab(s).
- **Analyst / Read-only** — view only; analysts use these materials when working batches (epic D) but cannot edit the catalogue.
**Definition of Done**
- All acceptance criteria met and verifiable.
- Global invariants honoured and tested where applicable (append-only audit with before/after, deactivate-not-delete, server-side enforcement, organisation isolation).
- The three types are represented with their required fields: Blank has no numeric target; Control standard and CRM have expected values + tolerance; CRM additionally has a certificate.
- Per-analyte expected values with both absolute and percentage tolerances verified.
- Generic analytes/units verified (not tied to any one element or method).
- Expiry flagging verified; expired materials marked clearly.
- New-lot-as-new-record and deactivate-not-delete verified; historical batch QC records stay intact.
- Certificate stored via the central attachment facility (ADR-3).
- All actions appear in the audit log with before/after on edits.
**ISO 17025 / compliance**
- **§7.7** — ensuring the validity of results: QC materials with known values are the backbone of result-validity monitoring.
- **§6.5** — metrological traceability: lot, expiry and certificate of reference materials (CRMs per ISO 17034) keep results traceable to a reference.
**Later (Part 11 / growth)**
- **Spike / recovery as a fourth QC type** with its own comparison logic (recovery %), a natural fit for ICP work — decided together with epic E (the comparison story), not built now.
- Expected-value changes require electronic-signature approval.
- Full link to the CRM certificate with metrological traceability and stated measurement uncertainty.
- Automatic lock-out the moment a lot passes its expiry date, with notification.
- Trending of QC results per lot over time (control charts) — overlaps with epic G.
- 🆕 Organisation-level analyte registry (one shared list referenced by methods and QC materials), replacing name-based matching.

## Changelog vs v1 (was: US-B2)
- **Cross-references renumbered** to v2: analytes/units consistent with US-B1, batch use → epic D, comparison → epic E; certificate now stored via the central attachment facility (ADR-3).
- **Organisation isolation** added (invariant 5).
- **AC 3 (made explicit) — the three types each carry their own comparison behaviour** (Blank = below-limit, Control standard / CRM = value ± tolerance). This is why the type set is **fixed, not free configuration** — a free-text type would leave epic E unable to know how to judge a QC result. Decision: fixed trio, unlimited materials within each type; spike/recovery parked for epic E.
- **AC 4 — tolerance per analyte as ± absolute OR percentage** (decision confirmed: CRMs often state absolute, control standards often percentage; forcing one form invites conversion errors).
- **Carried over (unchanged):** lot + expiry + certificate, new-lot-as-new-record, deactivate-not-delete, the relevance filter for batch QC, and both UI sketches.
- **Fable 5 review (1 Jul 2026) — approved with amendments:** (1) **AC 3 + AC 9:** the Blank comparison now points at the method's reporting limit (US-B1 AC 3, added in the same review — "below limit" had no defined limit anywhere), and the analyte **matching rule is explicit**: name (case-insensitive) + unit; name-based in the MVP, with an organisation-level analyte registry parked under Later. (2) **AC 2 + AC 10:** lot and expiry **required for Control standards and CRMs, optional for Blanks** — fresh-prepared reagent blanks have neither, and the UI sketch already showed a blank without them; the validation now matches. Everything else confirmed as written — the fixed type trio with per-type comparison behaviour, the ±/% tolerances and lot-as-new-record in particular.
- **AC 2 — code field (added 2 Jul 2026, epic D scope):** each material carries a short **code** ("BLK", "CS1") — Ramazan's design: instrument-import rows are matched on this code within the selected batch, so QC recognition needs no naming conventions and no elaborate position IDs. Unique per lab among active materials; analysts keep typing exactly what they type today.

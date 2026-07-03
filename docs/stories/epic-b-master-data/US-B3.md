# US-B3 — Equipment register & calibration

*Status: written with Opus 4.8 — reviewed with Fable 5, amended & approved 1 Jul 2026 · build: phase 3 — deliberately after epic C, just-in-time before epic D (see phase table)*
> **User story**
> As a lab manager, I want a register of equipment with its calibration and check status, so that work can only be done on equipment that is proven fit for use — for example, no weighing on a balance that isn't calibrated or has failed its daily check.

*Scope note: equipment belongs to a lab within one organisation (invariant 5). This story holds the register, calibration, routine checks and the computed availability state, plus the equipment↔method/step link that fills the design hook from US-B1 (AC 8). The gating itself ("no weighing on a blocked balance") is enforced in epic D; the link and the state live here.*
**Acceptance criteria**
1. Admins and lab managers can view a list of equipment showing name, equipment ID, type, lab, calibration status + due date, routine-check status, overall **availability state** and active/inactive. Lab managers see equipment in their own lab(s); admins see all equipment in their organisation.
2. Equipment is created with: name, a unique equipment/asset ID (unique within the organisation), **type** (from a configurable type list, e.g. Balance, ICP-OES, pH meter), manufacturer, model, serial number, lab, location and optional description.
3. **Calibration:** each piece of equipment records a calibration interval, last calibration date, a calibration due date (derived from the interval or set manually), and a calibration certificate reference/attachment (stored via the central attachment facility, ADR-3). The system flags calibration that is due soon or overdue.
4. **Routine in-use checks:** one or more recurring check types can be defined per equipment, each with a frequency (e.g. per-use / daily / weekly) and an acceptance criterion. *(e.g. a daily balance check against a 100.000 g check weight, tolerance ±0.002 g.)*
5. **Logging a check:** an authorized user records a check result — date/time, performer (the logged-in user), check type, pass/fail, an optional measured value, and notes. 🆕 When the check type has a numeric acceptance criterion and a measured value is entered, the system **computes pass/fail from the value** — a computed fail cannot be manually overridden to pass (a typo is corrected with a new entry); the manual pass/fail choice applies only to check types without a numeric criterion. Check records are **append-only**: a correction is a new entry, never an overwrite.
6. **Availability state is computed, not a stored flag:** each piece of equipment is **Available**, **Due soon**, or **Blocked**, derived live from its calibration status, its required-check status and the manual out-of-service flag.
	- **Blocked** when: calibration is expired, a required check is overdue, the last required check failed, or it is manually out of service.
	- **Due soon** (a warning, not a block) when calibration or a required check is approaching its due date. 🆕 The calibration warning window is configurable (default 30 days).
	- **Available** otherwise.
7. **Recovery is by resolving the condition, never by a generic "unblock":** because the state is computed, resolving the blocking condition clears it automatically — a renewed calibration, or a newly performed required check **that passes**, returns the equipment to Available/Due soon. A late check that is performed but **fails** stays Blocked (now for "last check failed"). There is deliberately **no manual "mark as available" button**, since that would let someone bypass the gate on equipment that isn't actually fit for use.
8. **Out of service is the one manual override:** an authorized user can take equipment out of service with a reason; it stays unavailable until an explicit **return to service**. Both actions are recorded. This is the only Blocked cause a human clears directly, because it was set deliberately.
9. **Being-blocked history is retained:** the fact that equipment was Blocked, when, and any late or failed check, stays in the append-only log even after it returns to Available — so it is always answerable whether anything ran on it during a blocked window. (In practice, epic D's gating prevents work while Blocked.)
10. **Method/step linkage:** equipment can be linked to one or more methods or method process steps — this fills the relation designed in US-B1 (AC 8). This link is what drives equipment-gating in epic D: a step requiring a piece of equipment cannot be completed while that equipment is Blocked. (Enforcement lives in epic D; the link and the state live here.)
11. **Deactivate, never delete:** equipment can be set inactive (not selectable for new work) but is never deleted; all calibration and check history is retained. Reactivatable.
12. The list clearly highlights equipment that is Blocked, Due soon, or has overdue/failed checks, so problems are visible at a glance.
13. Validation: equipment ID unique within the organisation; calibration interval and dates valid; a defined check has a frequency and acceptance criterion. Invalid records cannot be saved.
14. Every equipment action (create, edit with before/after, calibration update, check logged, out-of-service/return, method-link change, activate/deactivate) is written to the append-only audit log with the organisation context, recording who, what and when.
**Frontend (UI)**
```plain text
Admin ▸ Equipment                                        [ + New equipment ]

Name               ID        Type      Lab    Calibration   Checks       State
────────────────────────────────────────────────────────────────────────
Analytical bal. 1  BAL-001   Balance   MAIN   Valid →2027   OK (today)   Available
ICP-OES            ICP-01    ICP-OES   ENV    Valid →2026   —            Available
Analytical bal. 2  BAL-002   Balance   MAIN   Due 2026-06   Overdue      Blocked
pH meter           PH-03     pH meter  ENV    Valid →2026   Failed       Blocked
```
```plain text
Equipment — Analytical balance 1 (BAL-001)             State: Available

  Type        [ Balance ▼ ]    Lab [ Main lab ▼ ]   Location [ Weighing room ]
  Manufacturer[ … ]  Model [ … ]  Serial [ … ]

  Calibration
    Interval [ 12 months ]   Last 2026-01-15   Due 2027-01-15  (Valid)
    Certificate  [ cal_BAL-001_2026.pdf ]   [ Replace ]

  Routine checks
    Type          Frequency   Last check          Result   Next due
    Daily check   Daily       2026-06-09 08:12    Pass     2026-06-10
    [ + Log check ]    [ Define check types ]

  Linked methods / steps
    [x] ICP-OES metals in water → Sample prep
    [x] Moisture content → Weighing

  [ Take out of service ]                   Status (•) Active  ( ) Inactive
```
```plain text
Log check — Analytical balance 1 (BAL-001)
  Check type  [ Daily check ▼ ]    Performer: (current user)
  Date/time   2026-06-09 08:12
  Measured    [ 100.001 ] g     (check weight 100.000 g, tol ±0.002)
  Result      (•) Pass   ( ) Fail
  Notes       [ … ]
                                       [ Cancel ]   [ Save check ]
```
**Authorization**
- **Admin** — full equipment management across all labs of their organisation; manages the equipment-type list.
- **Lab manager** — create and manage equipment within their own lab(s); define check types; link equipment to methods; take out of service / return to service.
- **Analyst** — log routine checks for equipment in their lab(s) (e.g. the daily balance check) and view equipment status; cannot create or edit equipment or change calibration.
- **Read-only** — view only.
**Definition of Done**
- All acceptance criteria met and verifiable.
- Global invariants honoured and tested where applicable (append-only audit with before/after, deactivate-not-delete, server-side enforcement, organisation isolation).
- Availability-state logic verified for every Blocked trigger (expired calibration, overdue check, failed check, manual out-of-service) **and for restoration**, including the late-check-passes vs late-check-fails paths.
- Verified that **no generic manual "unblock"** exists; the only human-cleared cause is out-of-service via explicit return-to-service.
- Append-only checks verified (a correction creates a new entry; nothing is overwritten).
- Equipment↔method/step relation exists and exposes the state that epic D will read for gating.
- Configurable equipment types verified (not hard-coded to balances).
- Out-of-service / return and deactivate-not-delete verified; history retained, including the record of having been blocked.
- Calibration certificate stored via the central attachment facility (ADR-3).
- All actions appear in the audit log with before/after on edits.
**ISO 17025 / compliance**
- **§6.4** — equipment: records, calibration status, fitness for use, and taking equipment out of service.
- **§6.5** — metrological traceability via calibration to a reference.
- **§7.7** — the routine in-use checks are intermediate checks that help ensure ongoing result validity.
**Later (Part 11 / growth)**
- Electronic-signature approval on calibration acceptance and out-of-service decisions.
- Equipment qualification records (IQ/OQ/PQ) and a formal validation status.
- Automatic check/measurement capture directly from connected instruments (ties to epic D connectivity).
- Preventive-maintenance scheduling and work-order tracking.

## Changelog vs v1 (was: US-B3)
- **Cross-references renumbered** to v2: fills the equipment hook from US-B1 (AC 8); gating enforced in epic D; calibration certificate stored via the central attachment facility (ADR-3).
- **Organisation isolation** added (invariant 5); equipment ID unique within the organisation.
- **AC 6/7 — availability is a computed state with condition-based recovery (review decision):** all four conditions block; resolving the condition auto-clears the block; a late check must **pass** to restore (a late check that fails stays blocked as "last check failed"); there is **no generic manual unblock** (it would bypass the gate); out-of-service is the only human-cleared cause, via explicit return-to-service. (Your nuance, generalised.)
- **AC 9 — being-blocked history retained** in the log even after recovery, so it stays provable whether anything ran during a blocked window.
- **Carried over (unchanged):** calibration and routine checks modelled as separate things; configurable equipment types; analysts log routine checks; deactivate-not-delete; all three UI sketches.
- **Fable 5 review (1 Jul 2026) — approved with two amendments:** (1) **AC 5:** checks with a numeric criterion are **evaluated by the system**, not self-declared — closes the soft spot where a user could mark "pass" on an out-of-tolerance value and quietly bypass the equipment gate (server-side enforcement, invariant 4; typos are corrected append-only with a new entry). (2) **AC 6:** the calibration "due soon" window is configurable, default 30 days (invariant 7). Everything else confirmed as written — the computed availability state with condition-based recovery in particular is exactly right.

---
# Epic C — Sample lifecycle

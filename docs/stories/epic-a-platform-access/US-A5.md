# US-A5 — Lab management

*Status: written with Fable 5 — reviewed & frozen 1 Jul 2026 · build: phase 1*
> **User story**
> As an administrator, I want to manage the labs in the system, so that users, methods, equipment and data can be scoped to the right lab and a multi-lab organisation stays cleanly separated.

*Scope note: a lab belongs to exactly one organisation (invariant 5) and is the inner scoping boundary within it (US-A4 AC 7). This story manages labs; assigning users to labs happens in User management (US-A6).*
**Acceptance criteria**
1. An admin can view a list of all labs showing name, short code, status (active/inactive) and a count of how many users, methods and pieces of equipment are linked to each.
2. A new lab is created with: name, a short unique code (used in IDs and labels), and an optional description/location. The code is unique within the organisation 🆕 (was: across the system — two different customers may both have a "MAIN").
3. An existing lab's name, code and description can be edited. Changing a lab's code does not retroactively alter codes already embedded in existing job or batch identifiers (those stay as issued, for traceability).
4. **Labs are deactivated, never deleted.** A deactivated lab can no longer be assigned to new users, methods, equipment, jobs or batches, but all of its historical data and links are retained so the audit trail stays intact. A deactivated lab can be reactivated.
5. A lab cannot be deactivated while it still has active jobs or batches in progress; the system blocks this and explains why, so work isn't orphaned.
6. The lab acts as the scoping boundary used elsewhere: users (US-A6), methods, equipment, jobs and batches are all linked to a lab, and lab-scoped roles only see data for their assigned lab(s) (US-A4 AC 7).
7. An organisation 🆕 always retains at least one active lab: the last active lab of an organisation cannot be deactivated.
8. 🆕 When an organisation is provisioned (US-A2 AC 5), one default lab is seeded (name "Main lab", code "MAIN") and can be renamed/edited afterwards — so a new organisation is immediately usable and AC 7 holds from day one.
9. Every lab action (create, edit, activate/deactivate) is written to the append-only audit log, recording who did it, what changed and when.
**Frontend (UI)**
```plain text
Admin ▸ Labs                                            [ + New lab ]

Name                Code     Users   Methods   Equipment   Status
──────────────────────────────────────────────────────────────────
Main lab            MAIN       12       8          15       Active
Environmental lab   ENV         5       4           9       Active
External site       EXT         3       2           4       Inactive
```
```plain text
Edit lab — Environmental lab

  Name          [ Environmental lab        ]
  Code          [ ENV ]   (used in IDs; must be unique)
  Description   [ Water & soil testing, 2nd floor        ]

  Status        (•) Active    ( ) Inactive

                                      [ Cancel ]   [ Save ]
```
**Authorization**
- **Admin** — full lab management (create, edit, activate/deactivate).
- **Lab manager / Analyst / Read-only** — no access to lab management. (They are *assigned* to labs in US-A6; they do not manage the labs themselves.)
**Definition of Done**
- All acceptance criteria met and verifiable.
- Deactivate-not-delete verified: a deactivated lab's historical data and audit entries stay intact.
- Block-on-active-work verified by test (cannot deactivate a lab with open jobs/batches).
- Last-active-lab protection verified by test (per organisation).
- Unique-code enforcement verified (within organisation; same code allowed in two different organisations).
- 🆕 Seeded default lab verified as part of the provisioning test (US-A2).
- All lab actions appear in the audit log.
**ISO 17025 / compliance**
- No direct technical clause. Supports **§7.11** (organisation/scoping of data) so that records, methods and equipment stay linked to the correct lab — a structural enabler for the clauses that do carry requirements (§7.4, §7.5, §6.4).
**Later (Part 11)**
- Electronic signature on lab activation/deactivation as a controlled action.

## Changelog vs v1 (was: US-A4)
- **Renumbered** US-A4 → US-A5; this is the deliberate order swap from the mapping (labs before users: you cannot assign someone to a lab that does not exist). Cross-references updated: users = US-A6, lab scope = US-A4 AC 7.
- **AC 2:** code uniqueness scoped to the **organisation** instead of the whole system (ADR-1) — two different customers can both have a lab coded "MAIN" without colliding.
- **AC 7:** last-active-lab protection now per organisation (ADR-1).
- **AC 8 (new):** provisioning seeds one default lab ("Main lab" / "MAIN", editable) so a fresh organisation is immediately usable and AC 7 holds from day one. This resolves a cold-start gap: without it, a new organisation has zero labs and AC 7 is undefined. *Alternative considered:* start with zero labs and make "create your first lab" an explicit setup step — slightly more honest, slightly more friction. Ramazan's call; default = seeding. **✅ Confirmed (1 Jul 2026): seeding.**
- **Scope note (new):** lab belongs to exactly one organisation; inner vs outer boundary made explicit.
- **Unchanged:** AC 1, 3, 4, 5, 6 (reference renumbering only), 9; user story; both UI sketches; Authorization (reference renumbering only); compliance block; Later.
- **DoD:** + seeded-lab check in the provisioning test; unique-code test now explicitly cross-organisation.

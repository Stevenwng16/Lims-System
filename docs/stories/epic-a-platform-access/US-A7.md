# US-A7 — Settings

*Status: written with Fable 5 — reviewed & frozen 1 Jul 2026 · AC 9 added same day (epic C review) · batch format, qualifier list + reviewer toggle added 2 Jul (epic D) · build: phase 1*
> **User story**
> As an administrator, I want one place to configure my organisation's security rules, identifier formats, labels and per-lab options, so that the LIMS matches how our labs work without any code changes.

*Scope note: everything here is organisation-level or lab-level configuration, seeded with safe defaults at provisioning (US-A2 AC 5). True platform-level configuration (vendor side) is out of scope and lives in US-A2. Settings are enforced by the stories that own them (US-A1 security, US-A4 permissions); this story is where they are set.*
**Acceptance criteria**
1. An admin can open a Settings area organised into sections: **Security**, **Identifiers & labels**, and **Lab settings**. Every setting has a safe default seeded at provisioning 🆕 (US-A2 AC 5), so a fresh organisation is fully functional without touching anything here.
2. **Security (organisation-wide 🆕)** — configurable and enforced via US-A1:
	- Password policy: minimum length (default 12) and complexity options.
	- Account lockout threshold: number of failed attempts before lock (default 5).
	- Session inactivity timeout in minutes (default 30).
	- 🆕 Require MFA for all users of this organisation (on/off, default off) — moved here from Lab settings (US-A1 AC 5).
3. **Identifiers (organisation-wide 🆕)** — configurable templates using tokens for the job number and the sample number:
	- Available tokens: `{LAB}` (lab code), `{YY}` / `{YYYY}` (year), `{MM}` (month), `{SEQ:000}` (running number with zero-padding).
	- Job number default: `{LAB}{YY}-{SEQ:00000}` → e.g. `MAIN26-00001`.
	- Sample number default: `{JOB}.{SEQ:000}` → e.g. `MAIN26-00001.001`.
	- 🆕 Batch number default *(added 2 Jul 2026, epic D)*: `{LAB}B{YY}-{SEQ:0000}` → e.g. `MAINB26-0001`.
	- A live preview shows an example generated ID as the template is edited.
	- Sequence reset option: never / yearly / monthly.
	- 🆕 Sequences run per organisation **and** per lab (and per reset period): two labs each have their own counter, and two organisations can never see or influence each other's numbering (ADR-1, design rule 3).
4. Changing an identifier format only affects **newly** generated IDs. Already-issued job and sample numbers are never reissued or altered — they stay as originally generated for traceability.
5. **Label (organisation-wide 🆕):** the user-facing label for the "job" object is configurable (default "Job"; e.g. "Work order", "Submission", "Project"). The label is shown throughout the UI; the underlying data object and its name in the data model are unchanged.
6. **Lab settings (per lab)** — set by an admin, take effect immediately, enforced via US-A4:
	- Analysts may create batches (default off; US-A4 AC 5).
	- 🆕 Reviewer must differ from the performing analyst(s) (default off; enforced via US-D6 AC 2) *(added 2 Jul 2026, epic D)*.
	- 🆕 *(MFA moved to Security above; this section keeps genuinely per-lab workflow options and grows as later epics add them.)*
7. Input is validated: an identifier template without a `{SEQ}` token is rejected with a clear message, and numeric fields enforce sensible min/max. Invalid settings cannot be saved.
8. Every settings change is written to the append-only audit log, recording who changed it, the old value, the new value and when. (Configuration changes are exactly what an auditor checks.)
9. 🆕 **Lists & label configuration (organisation-wide, in the Identifiers & labels section)** *(added 1 Jul 2026, epic C review):* (a) the **sample-type list** used at sample registration (US-C1 AC 5) — add, rename, deactivate; never delete, historical samples keep their type; (b) **barcode-label configuration** (US-C4): symbology (default Code 128), label size (default 50 × 25 mm) and label fields — the human-readable sample ID cannot be switched off; (c) 🆕 the **result-qualifier list** (US-D4 AC 3) *(added 2 Jul, epic D)*: extra qualifiers available at result entry beyond the fixed `<` and `>` (default list contains "n.b.") — add, rename, deactivate; never delete, historical results keep theirs.
**Frontend (UI)**
```plain text
Admin ▸ Settings

┌ Security (organisation) ───────────────────────────────┐
│  Minimum password length      [ 12 ]                    │
│  Require complexity            [x]                       │
│  Lockout after failed attempts [ 5 ]                     │
│  Session timeout (minutes)     [ 30 ]                    │
│  Require MFA                   [ ]                       │
└─────────────────────────────────────────────────────────┘

┌ Identifiers & labels (organisation) ───────────────────┐
│  Job number format   [ {LAB}{YY}-{SEQ:00000}        ]   │
│      Preview:  MAIN26-00001                             │
│  Sample number format[ {JOB}.{SEQ:000}              ]   │
│      Preview:  MAIN26-00001.001                         │
│  Sequence reset      ( ) Never (•) Yearly ( ) Monthly   │
│                                                         │
│  Label for "job"     [ Job ]   (shown across the UI)    │
└─────────────────────────────────────────────────────────┘

┌ Lab settings ──────────────────────────────────────────┐
│  Lab: [ Main lab ▼ ]                                    │
│    Analysts may create batches [ ]                      │
└─────────────────────────────────────────────────────────┘

                                      [ Cancel ]   [ Save ]
```
**Authorization**
- **Admin** — full access to all settings (organisation-wide and per-lab).
- **Lab manager / Analyst / Read-only** — no access to Settings.
**Definition of Done**
- All acceptance criteria met and verifiable.
- Defaults seeded at provisioning; a fresh organisation works with no configuration (verified as part of the US-A2 provisioning test).
- Identifier preview and validation verified by test (including the rejected no-`{SEQ}` case).
- Verified that changing a format does not alter existing IDs.
- 🆕 Sequence isolation verified by test: counters independent between two labs, and between two organisations.
- Org-wide toggles verified to take effect immediately (MFA requirement); per-lab toggle verified (analyst batch creation).
- All settings changes appear in the audit log with old and new values.
**ISO 17025 / compliance**
- **§7.11** — controlled configuration of the information-management system; configuration changes are recorded.
- **§8.4** — records: settings changes are logged with old/new value, which is exactly what an auditor reviews.
**Later (Part 11)**
- A settings change requires an electronic signature to apply.
- Settings are versioned and a configuration can be locked to a validated state.
- Change-control workflow: a setting change is proposed, then must be approved before it takes effect.

## Changelog vs v1 (was: US-A5)
- **Renumbered** US-A5 → US-A7; enforcement references updated (US-A2 → US-A4).
- **Core of this rewrite:** every "system-wide" setting is now **organisation-wide** (ADR-1) — Security, Identifiers, Label. True system level belongs to the platform (US-A2) and has no settings here.
- **MFA toggle moved** from Lab settings (v1 AC 6) to the Security section (AC 2), organisation-wide — this completes the decision flagged at US-A1 AC 5. If you reject that decision in review, both stories revert together. **✅ Confirmed (1 Jul 2026).** Lab settings deliberately keep the analyst-batch toggle per lab (workflow policy; see the US-A4 changelog for the reasoning).
- **AC 3:** sequence scoping made explicit — per organisation + per lab + per reset period (ADR-1, design rule 3). Two organisations can never see or influence each other's numbers; two labs within one organisation each count independently. New DoD test for both.
- **AC 1 / DoD:** seeding moment changed from "at install" to "at provisioning" (US-A2 AC 5) — same defaults, different lifecycle under multi-tenancy.
- **Unchanged:** all tokens, defaults and formats; AC 4 (ID stability); AC 5 label mechanism; AC 7 validation; AC 8 audit logging with old/new values; Authorization; compliance block; Later. UI sketch only moved the MFA line.
- **AC 9 (added 1 Jul 2026, epic C review):** organisation-wide **lists & label configuration** — the home for the sample-type list (US-C1) and the barcode-label settings (US-C4), which both referenced Settings without a defined landing spot. Deliberate amendment to a frozen story, exactly per the freeze rule: conscious change + changelog entry.
- **AC 3 — batch-number template (added 2 Jul 2026, epic D):** batches get their own configurable identifier format, default `{LAB}B{YY}-{SEQ:0000}` — needed by US-D1 AC 2; same deliberate-amendment route.
- **AC 9 extended (2 Jul 2026, epic D):** third organisation list added — the **result-qualifier list**, consumed by US-D4 AC 3; same route.
- **AC 6 extended (2 Jul 2026, epic D):** per-lab toggle **"reviewer must differ from the performing analyst(s)"** (default off), consumed by US-D6 AC 2 — answered question 6: segregation as a per-lab choice, mirroring the batch-creation toggle pattern.

*Story provenance and review status: see the status line under each story heading.*
---
# Epic B — Master data & configuration

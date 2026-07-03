# LIMS — project instructions for Claude Code

Multi-tenant SaaS LIMS for ISO 17025-accredited SME laboratories (NL/RvA market).
Core promise: a lab sells provably reliable measurements — every design choice must survive the question **"can we prove it afterwards?"**

## Source of truth

- `docs/stories/` contains the **full backlog (US-A1 … US-D6)**, exported from the master document in Notion. These snapshots are the working spec. The Notion backlog is the master for story *text*: amendments are decided there (with changelog entries) and re-exported here — never edit a story file to make failing code pass.
- `docs/architecture-kaders.md` summarises the four architecture frames (ADR-1…4): requirements are fixed, mechanisms are the developer's choice.
- `docs/decision-log.md` is the **operational decision log** — see the one non-negotiable rule below.

## The seven invariants (apply to every line of code)

1. **Append-only audit log** — every domain action is recorded (who, what, when, organisation context, before/after on edits). Nothing in the log is ever updated or deleted.
2. **Never delete** — domain records are deactivated or voided **with a reason**, never hard-deleted. History must stay reconstructable.
3. **Version, don't overwrite** — masterdata that has been *used* (methods, templates) gets a new version on change; the old version stays referenced by the work that used it.
4. **Server-side enforcement** — every permission, gate and validation is enforced on the server. UI hiding is presentation, never the security boundary.
5. **Tenant isolation** — every domain row belongs to exactly one organisation. No query, view, export or API response may ever cross the organisation boundary. `organisation_id` on every table, no exceptions (audit log, files, settings included).
6. **Attributability** — every action traces to one real, personal account. No shared accounts, no system writes without actor context.
7. **Configurable over hardcoded** — lists, formats, toggles and thresholds that differ per lab/organisation are configuration, not code.

## How to work a story

1. Open the story file in `docs/stories/`. The **acceptance criteria are the contract** — never weaken, skip or reinterpret an AC to make implementation easier. If an AC seems wrong or impossible: **stop and ask Ramazan**; do not silently deviate.
2. Check the **Developer decisions** block (when present, directly under the ACs). These decisions are made **together with Ramazan**: present the options with a clear recommendation, let him choose, then proceed — do not decide unilaterally (agreed 3 Jul 2026). The frames in `docs/architecture-kaders.md` bound the option space. A story *without* that block means: nothing fundamental to choose — just build.
3. Implement with the invariants above. The **Definition of Done** in each story lists the tests that must exist and pass — they are part of the story, not optional.
4. **Log every fundamental choice** as one line in `docs/decision-log.md` *at the moment you make it* (what · why · date · relates to). This is the one non-negotiable discipline: it feeds the validation package for accredited customers. "We no longer know why" is not an answer we can afford.
5. UI sketches in stories are **indicative** (layout/flow intent), not pixel specs. Cross-references (e.g. "US-B1 AC 3") are binding.

## Build order (per the phase table)

- **Phase 1:** US-A1 → A2 → A3 → A4 → A5 → A6 → A7
- **Phase 2:** US-B1 → C1 → C2 → C3 → C4
- **Phase 3:** US-B2 → B3 → D1 → D3 → D4 → D2 → D5 → D6
- Document order in `docs/stories/` is by ID; **build order is the list above** (each story's status line names its phase). B2/B3 deliberately build after epic C; D2 after D4.
- Epics B4, E (QC evaluation, nonconforming work, audit-trail UI), F (reports/CoA, §7.8.8 amendments) and G (dashboards) are **out of scope until phases 1–3 ship** — hooks for them exist in the stories; build the hooks, not the epics.

## Stack context (non-binding advice already in the stories)

Azure stack. Open choices live in the Developer decisions blocks: auth provider (advice: Entra ID External ID — SSO-ready per US-A1 AC 12), tenant-isolation mechanism + DB flavour (advice: shared DB + `organisation_id` + row-level security; Azure SQL and Azure Database for PostgreSQL both support RLS), subdomain vs path routing, SPA vs server-rendered, file storage (advice: Azure Blob — immutability + versioning fit ADR-3), measurement-record event structure, import parser approach.

## Hard "never" list

- Never store measurement values as floats — use a decimal type, full precision as entered; rounding only at reporting (round half up, system-wide).
- Never guess a decimal separator; ambiguous input is rejected (ADR-4).
- Never add a generic "unblock"/"mark available" bypass on equipment (US-B3 AC 7).
- Never let a set-back reopen batch composition (US-D1 AC 10 latch / US-D3 AC 6).
- Never write code that reads or joins across organisations, "just for admin" included — vendor access goes through the consent-based support flow (US-A2).
- Never mint, change or reissue an ID (job/sample/batch) after creation.
- Never skip the audit write "for now".

## Language & conventions

Code, comments, commits, identifiers: **English**. Domain terms match the stories exactly: *organisation, lab, job, sample* (never "lot"), *batch, method (version), analyte, QC material, clearance, acceptance decision, void*.

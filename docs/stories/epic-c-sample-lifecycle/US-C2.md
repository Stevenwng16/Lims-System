# US-C2 — Job overview

*Status: written with Opus 4.8 — reviewed with Fable 5, amended & approved 1 Jul 2026 · build: phase 2*
> **User story**
> As a lab manager, I want an overview of all jobs in my active lab, so that I can monitor incoming work, see each job's status at a glance and open a job for details.

*Scope note: this is the landing page after login (US-A3 AC 5). It is a read-only view — it creates no records. The overview is scoped to the active lab shown in the navigation shell (US-A3 AC 4); switching labs happens in the shell, not here.*
**Acceptance criteria**
1. After login, users land on the Job overview (US-A3 AC 5). It lists jobs as one row per job, scoped to the **active lab** shown in the shell (US-A3 AC 4); a user assigned to multiple labs switches labs via the shell's lab switcher. Visibility never crosses the organisation boundary (invariant 5).
2. Each row shows: job number, customer, date received, sample type(s), status, and deadline. The page title and the *New job* button use the configured job label from Settings (US-A7; default "Job").
3. A search bar filters the list in real time by job number or customer.
4. The list is filterable by: status, sample type, method, date received (range), and customer. Search and filters combine.
5. The list is sortable by: job number, customer, date received, and deadline.
6. **Sample type column:** shows the type when all of a job's samples share one; shows "Mixed" when a job contains more than one sample type (jobs can have mixed types since US-C1).
7. **Status is derived from the job's active samples** (accepted, non-voided):
	- No sample placed in a batch yet → ⚪ Not started
	- At least one sample in a batch / being processed → 🔵 In progress
	- All active samples completed → ✅ Completed
	- A job whose samples are all rejected or voided → **Closed** (no testable samples)
8. **Deadline indicator is separate from status:** the deadline is shown, and a deadline that has passed or is within 24h (while the job is not completed) is flagged ⚠️. A job can be *In progress* and overdue at the same time.
9. A *New job* button at the top navigates to job creation & sample registration (US-C1). It is visible only to Admin and Lab manager (US-A4).
10. Completed and voided jobs 🆕 are hidden by default; a toggle shows them (a voided job — US-C1 AC 13 — is visually muted when shown).
11. Clicking a row navigates to the job detail page (US-C3).
12. The overview reflects current data; status and deadline indicators update as samples move through batches (epic D).
**Frontend (UI)**
```plain text
Jobs                                                              [ + New job ]

[🔍 Search job number or customer]
[ Status ▾ ] [ Sample type ▾ ] [ Method ▾ ] [ Received from–to ] [ Reset ]
[ ] Show completed & voided jobs

Job number     Customer            Received    Sample type   Status          Deadline
──────────────────────────────────────────────────────────────────────────────────────
MAIN26-00042   Acme Water Auth.    Jun 09      Mixed         🔵 In progress   Jun 16
MAIN26-00041   BioFoods BV         Jun 08      Water         ⚪ Not started   Jun 18
MAIN26-00039   Stad Rotterdam      Jun 05      Soil          🔵 In progress   Jun 06 ⚠️
MAIN26-00037   Acme Water Auth.    Jun 03      Water         ✅ Completed     Jun 10

Colour: ⚪ not started   🔵 in progress   ✅ completed   ⚠️ overdue / due ≤24h
```
**Authorization**
- **Admin** — view jobs across all labs of their organisation (via the shell's lab switcher); can create new jobs.
- **Lab manager** — view jobs within their own lab(s) (switch via the shell); can create new jobs.
- **Analyst** — view jobs within their own lab(s); the *New job* button is hidden; no edit (consistent with US-A4).
- **Read-only** — view and filter within scope; *New job* button hidden.
**Definition of Done**
- All acceptance criteria met and verifiable.
- List scoped to the active lab and tested with all filter + sort parameters; visibility never crosses the organisation (invariant 5), enforced server-side (invariant 4).
- Search filters on job number and customer in real time; search + filters combine correctly.
- Status correctly derived from active samples, excluding rejected/voided ones; "Closed" case verified.
- "Mixed" sample-type display verified.
- Overdue / due-≤24h flag verified as separate from base status.
- *New job* button visibility correct per role.
- Row click navigates to the correct job detail page.
- Configured job label used throughout the UI.
**ISO 17025 / compliance**
- **§7.11** — controlled, lab-scoped access to job and sample data. This is a read-only view; it creates no records itself.
- Supports the sample-tracking visibility the lab requires ("where are my jobs/samples").
**Later (Part 11 / growth)**
- Optional logging of who viewed which job data, if required by a client.
- Saved / shared filtered views per user.
- A cross-lab overview / dashboard (epic G) for users who oversee multiple labs at once.

## Changelog vs v1 (was: US-C2)
- **Cross-references renumbered** to v2: New job → US-C1, row → job detail US-C3, job label → US-A7, navigation shell → US-A3, roles → US-A4.
- **Aligned with the navigation shell (US-A3):** the overview is now scoped to the **active lab** from the shell, and lab switching lives in the shell — so the standalone **Lab column and Lab filter** from v1 are removed (they'd duplicate the shell's lab context). This is also the landing page after login (US-A3 AC 5).
- **Organisation isolation** added (invariant 5): visibility never crosses the organisation boundary, enforced server-side.
- **Carried over from the v1 rework (unchanged):** the "Sample Overview" misnomer stays fixed (rows are jobs); status is derived from the job's active samples (not "lot numbers"); "delayed" stays decoupled as a separate ⚠️ overdue flag (a job can be in progress *and* overdue); neutral examples (MAIN26/ENV, Water/Soil); analyst access is read-only within their lab (not the old "no access").
- **Fable 5 review (1 Jul 2026) — approved with one amendment:** **AC 10:** voided jobs (US-C1 AC 13) are now explicitly hidden by default alongside completed ones — C1 could void a job, but this overview never said what happens to it. Everything else confirmed, the derived status model and the decoupled ⚠️ overdue flag in particular.

# US-C3 — Job detail

*Status: written with Opus 4.8 — reviewed with Fable 5, amended & approved 1 Jul 2026 · build: phase 2*
> **User story**
> As a lab manager, I want all information about a job in one place, organised in tabs, so that I can review its details, track its samples, see its batches and follow its history.

*Scope note: scoped to the active lab (US-A3); a job belongs to one lab within one organisation (invariant 5). Barcode printing is split out to US-C4 — this page only links to it. The History tab is a view on the audit log filtered to this job, not a separate log; the full audit-trail story lives in epic E.*
**Acceptance criteria**
1. The job detail page is reached by clicking a job in the job overview (US-C2), scoped to the user's lab(s) within their organisation (invariant 5).
2. The page has a header that is always visible regardless of the active tab, showing: job number, customer, overall status, and deadline (with the ⚠️ overdue / due-≤24h flag from US-C2).
3. The page has four tabs: **Details**, **Samples**, **Batches**, and **History**.
4. **Details tab** shows the full job header: customer, customer reference, lab, date + time of receipt, received by, requested method(s), priority/deadline, and notes — with an *Edit job* button. The job number is shown but can never be changed, 🆕 and the lab is fixed at creation — the job number embeds the lab code and sequences run per lab (US-A7), so moving a job between labs is not possible; register anew and void the original instead. 🆕 The Details tab also offers *Void job* (Admin/Lab manager, reason required — US-C1 AC 13); a voided job shows a clear banner and is hidden from the default overview (US-C2 AC 10).
5. Editing job details is recorded with before/after in the append-only audit log; the job number and existing sample IDs are never altered by an edit.
6. **Samples tab** lists every sample under the job, showing per sample: sample ID, sample type, condition / deviation flag, acceptance decision (Accepted / Accepted with reservation / Rejected), current status (Received / In batch / In progress / Completed), and the batch(es) and current step it sits in. A rejected or voided sample is shown but visually muted.
7. From the Samples tab the user can **add a sample** to the job — this reuses the sample-registration flow from US-C1 (new immutable sample ID, sample type, condition, acceptance decision) and is logged.
8. From the Samples tab the user can **void a sample** with a reason (never hard-delete); the sample is retained and the action is logged (consistent with US-C1).
9. A **print barcode** affordance is present per sample and for the whole job, but the printing behaviour itself is defined in US-C4 (this tab only links to it).
10. **Batches tab** shows a read-only list of batches that contain samples from this job, with batch ID, method, current step, status and deadline; clicking one opens the batch detail (epic D). The tab is empty until batches exist; it is designed now and populated once epic D is built.
11. **History tab** shows a chronological, read-only log of all actions on this job and its samples (date/time, user, action). It is a **view on the append-only audit log**, filtered to this job — not a separate log. It cannot be edited or deleted. The full audit-trail story lives in epic E; this tab is the job-scoped view of it.
12. The overall status in the header is derived from the job's active samples, identical to the rule in US-C2.
**Frontend (UI)**
```plain text
Job MAIN26-00042  |  Acme Water Authority  |  🔵 In progress  |  Jun 16
────────────────────────────────────────────────────────────────────────
[ Details ]  [ Samples ]  [ Batches ]  [ History ]
```
```plain text
Samples tab                                  [ + Add sample ]  [ 🖨 Print all ]

  Sample ID         Type    Cond.  Acceptance               Status         Batch    Step      🖨
  ──────────────────────────────────────────────────────────────────────────────────────────────
  MAIN26-00042.001  Water   OK     Accepted                 🔵 In progress  B-0007  Digestion [🖨]
  MAIN26-00042.002  Water   ⚠      Accepted w/ reservation  ⚪ Received      —       —         [🖨]
  MAIN26-00042.003  Soil    OK     Accepted                 ✅ Completed     B-0006  —         [🖨]
```
```plain text
History tab   (read-only view on the audit log, scoped to this job)
  Date/time          User          Action
  ─────────────────────────────────────────────────────────────────
  2026-06-09 14:20   A. de Vries   Job created, 3 samples registered
  2026-06-09 14:22   A. de Vries   Sample .002 accepted with reservation (leaking cap)
  2026-06-10 09:05   P. Jansen     Sample .003 added to batch B-0006
  2026-06-11 16:40   P. Jansen     Sample .003 completed
```
**Authorization**
- **Admin / Lab manager** — full access to all tabs within their lab(s); can edit or void the job, add and void samples, and trigger barcode printing (US-C4).
- **Analyst** — view all tabs within their lab(s); cannot edit the job or add/void samples (consistent with US-A4). May print barcodes per US-C4 if their work requires it.
- **Read-only** — view only on all tabs; no edit, add, void or print.
**Definition of Done**
- All acceptance criteria met and verifiable.
- Global invariants honoured and tested where applicable (append-only audit with before/after, void-not-delete, server-side enforcement, organisation isolation).
- Header always visible with correct job info and derived status across all tabs.
- Details edit works with before/after audit logging; job number immutable.
- Samples tab shows live sample status, batch and step; rejected/voided samples shown but muted.
- Add sample reuses the US-C1 registration flow and is logged; void-not-delete verified.
- Batches tab renders linked batches (once epic D exists) and navigates to batch detail.
- History tab renders the job-scoped audit view, read-only and immutable.
- Lab scoping enforced on the whole page; visibility never crosses the organisation (invariant 5).
**ISO 17025 / compliance**
- **§7.5** — technical records: the job detail is the consolidated, traceable record of the job and its samples.
- **§7.4** — the sample condition, deviation and acceptance decision remain visible and any change is traceable.
- **§7.11** — lab-scoped, controlled access to the record.
- The History tab is the job-scoped surface of the **§8.4 / ALCOA+** audit trail (built once in epic E, shown in many places).
**Later (Part 11)**
- Electronic signature on job-detail edits and sample voids.
- The History tab shows the fully Part-11-compliant audit trail (reason-for-change captured, signature-bound).

## Changelog vs v1 (was: US-C3)
- **Cross-references renumbered** to v2: job overview → US-C2, barcode printing → US-C4, registration flow + void → US-C1, batch detail → epic D, audit-trail story → epic E, roles → US-A4, shell → US-A3.
- **Organisation isolation** added (invariant 5): visibility never crosses the organisation boundary; lab scoping is the inner boundary.
- **Carried over from the v1 rework (unchanged):** barcodes split out to US-C4 (the old "Samples & Barcodes" tab is now just "Samples" with a print link); "sample" not "lot"; the **History tab is a view on the audit log**, not a separate mechanism (the "one event-log, many views" principle, so it isn't built twice); the **Batches tab is a design hook** (empty until epic D); analyst access is read-only within their lab (not the old "no access").
- **Fable 5 review (1 Jul 2026) — approved with two amendments, both on the Details tab (AC 4):** (1) the **lab is fixed at creation** — the job number embeds the lab code and sequences run per lab, so "moving" a job between labs would corrupt traceability; the escape route is register-anew + void. (2) an explicit **Void job** affordance — US-C1 AC 13 defined voiding a job, but no screen actually offered it; now it lives here, with banner and default-hidden in the overview. History-as-a-view and the tab structure confirmed as written.

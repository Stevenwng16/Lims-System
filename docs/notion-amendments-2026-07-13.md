# Notion amendment drafts — 13 Jul 2026

Two decisions taken with Ramazan on 13 Jul 2026 change story text. Per the
working agreement, amendments are **decided in Notion** (with changelog
entries) and re-exported to `docs/stories/`. These are ready-to-paste drafts;
the code already implements them (see the decision log of the same date).

## Decision A — Jobs are organisation-wide; batches stay lab-scoped

**Rationale:** one customer order = one job number, even when several labs do
the work (an order needing metals + conductivity is ONE order; two numbers
would have to be stitched together on the report). The lab context of the
work derives from each requested method (methods are lab-scoped masterdata);
execution stays in lab-scoped batches.

### US-C1 (job intake)
- AC stating the job is registered *in a lab*: **replace** with — "A job
  belongs to the organisation, not to a lab. Every requested method routes
  its work to the method's lab; one job may involve several labs."
- AC 2 (job number): **amend** — job numbers are organisation-wide; the
  sequence runs per organisation + reset period. The `{LAB}` token is not
  available in job or sample number formats (it remains, and is required, in
  batch number formats — batch sequences run per lab).
- AC 14 (methods of the job's lab): **replace** with — "Requested methods
  must be active methods of the organisation (any lab). The method's lab is
  shown with the method wherever it is offered."
- Authorization: Admins and Lab managers create and manage jobs
  organisation-wide (registration is a reception function; the lab boundary
  governs execution).

### US-C2 (job overview)
- AC 1 (scoped to the active lab): **amend** — "The overview shows the jobs
  with requested work in the active lab. A vendor support session and an
  admin's 'All labs' view render organisation-wide. A lab-scoped user with no
  active lab sees an empty list."

### US-A5 (labs) — AC 6
- **Amend** "users, methods, equipment, jobs and batches are all linked to a
  lab" → jobs are organisation-wide; they relate to labs only through their
  requested methods. Users (lab-scoped roles), methods, equipment and batches
  stay linked to a lab.

### US-A7 (settings) — AC 3
- **Amend** — job sequences run per organisation + reset period (not per
  lab). Batch sequences stay per lab (+ period); sample sequences stay per
  job. Validation: `{LAB}` rejected in job/sample formats, required in the
  batch format.

### US-D1 (batches) — AC 3 (eligibility)
- **Amend** — eligible for a batch (lab L, method M): accepted, non-voided
  samples — from any job — whose requested work routes to lab L (a sample
  requesting M is always eligible; a same-lab sample not requesting M keeps
  the explicit-confirm flow of AC 5).

## Decision B — Admins are organisation-wide (no lab assignments)

**Rationale:** Admin is already an org-scoped role in the stories ("admins
see all"); requiring lab assignments for admins only gated the lab switcher
and forced awkward assignment side effects. Lab-scoped roles are unchanged.
Supersedes the same-day "creator is assigned to every lab they create"
decision (now removed).

### US-A3 (shell) — AC 4
- **Amend** — "Admins switch between 'All labs' (default) and any active lab
  of the organisation; the switcher for lab-scoped users offers only labs
  they are assigned to. Batch creation always happens in a concrete lab."

### US-A6 (users) — AC 2
- **Amend** — "A new user is created with … one or more lab assignments
  **unless the role is Admin** (admins are organisation-wide and carry no lab
  assignments)." AC 1's user list shows "—" / "org-wide" for admins.

### US-A4 (roles) — AC 7 (clarification, no behaviour change)
- **Clarify** — "each **lab-scoped** user is assigned to one or more labs…;
  Admin is organisation-scoped."

## Decision C — Org-specific lists start empty at provisioning

**Rationale:** sample types, result qualifiers and equipment types are the
lab's own taxonomy; pre-filled guesses get silently kept and leak into
accredited records (same reasoning as the no-default-lab decision). "Safe
defaults" (US-A2 AC 5) = empty for org-specific lists; structural settings
(security, identifier formats, barcode) keep real defaults.

### US-A2 (provisioning) — AC 5
- **Clarify** — "seeded with safe defaults" means: structural settings get
  working defaults; org-specific lists (sample types, result qualifiers,
  equipment types) start EMPTY and are defined by the organisation's admin.

### US-B3 (equipment) — AC 2
- **Amend** — the configurable equipment-type list starts **empty**; the
  starter list (Balance / pH meter / Thermometer) is dropped. Types are
  added on the Equipment page as before.

## Decision D — US-C3 AC 4 rewritten (follow-through of Decision A)

**Rationale:** AC 4 as frozen reads "the lab is fixed at creation — the job
number embeds the lab code and sequences run per lab (US-A7), so moving a job
between labs is not possible; register anew and void the original instead."
Under Decision A every clause is obsolete: a job has no lab, job numbers carry
no lab code, and job sequences run per organisation. The immutability intent
survives; the lab clauses do not. (Coverage gap found in the 17 Jul 2026 doc
audit — see docs/PROJECT_STATE.md §8.)

### US-C3 (job detail & edit) — AC 4
- **Replace** with — "The job number and every issued sample ID are fixed at
  creation and never change or get reissued (US-C1 AC 2). A job carries no
  lab: the lab(s) involved are derived from its requested methods, so work
  moves between labs only by editing the requested methods (an audited edit).
  Register anew and void the original only when the order itself was
  registered in error."

## Decision E — US-D2 AC 1 gains the org-wide admin view (follow-through of Decision B)

**Rationale:** admins carry no lab assignments; their default shell context is
"All labs", and the batch work queue renders organisation-wide in that context
(as it already does for a vendor support session). Working a batch still
happens in a concrete lab. Note: US-D2's story status is still "Ramazan's
review pending" — fold this amendment into that review. (Coverage gap found in
the 17 Jul 2026 doc audit.)

### US-D2 (work queue) — AC 1
- **Amend** — "The queue lists the batches of the active lab. An admin's
  'All labs' view and a vendor support session render the queue
  organisation-wide. Working a batch (claiming, advancing steps, entering
  results) always happens in a concrete lab context, and batch creation
  requires picking a lab."

## Decision F — the result-qualifier list also starts empty (completes Decision C)

**Rationale:** Decision C covered sample types and equipment types; the
result-qualifier list is the same class of org-specific taxonomy, so its
"n.b." default is dropped too. The demo dataset seeds its own qualifier as
data. (Coverage gap found in the 17 Jul 2026 doc audit.)

### US-A7 (settings) — AC 9c
- **Amend** — the configurable result-qualifier list starts **empty** at
  provisioning (the "n.b." default entry is dropped); the admin defines the
  organisation's qualifiers under Settings ▸ Result qualifiers.

### US-D4 (result entry) — AC 3
- **Amend** — the qualifier picker offers the organisation's configured
  qualifiers (alongside the fixed `<` and `>` censored forms); no default
  entry is promised.

## Changelog lines (for the Notion changelog)

- 13 Jul 2026 — Jobs made organisation-wide (one order = one number; methods
  route work to labs; batches stay lab-scoped). US-C1 AC 2/14, US-C2 AC 1,
  US-A5 AC 6, US-A7 AC 3, US-D1 AC 3 amended. Decided by Ramazan.
- 13 Jul 2026 — Admins made organisation-wide (no lab assignments; "All
  labs" switcher default). US-A3 AC 4, US-A6 AC 2 amended; US-A4 AC 7
  clarified. Decided by Ramazan.
- 13 Jul 2026 — Org-specific lists (sample types, result qualifiers,
  equipment types) start empty at provisioning. US-A2 AC 5 clarified,
  US-B3 AC 2 amended. Decided by Ramazan.
- 13 Jul 2026 — US-C3 AC 4 rewritten: jobs are organisation-wide, so no lab
  is fixed at creation and job numbers carry no lab code; ID immutability
  unchanged. (Follow-through of the org-wide-jobs decision; coverage gap
  closed 17 Jul 2026.)
- 13 Jul 2026 — US-D2 AC 1 amended: the work queue renders organisation-wide
  for an admin's "All labs" view and vendor support sessions, alongside the
  active-lab view. (Follow-through of the org-wide-admins decision; coverage
  gap closed 17 Jul 2026.)
- 13 Jul 2026 — US-A7 AC 9c and US-D4 AC 3 amended: the result-qualifier
  list starts empty at provisioning, no "n.b." default. (Completes the
  empty-lists decision; coverage gap closed 17 Jul 2026.)

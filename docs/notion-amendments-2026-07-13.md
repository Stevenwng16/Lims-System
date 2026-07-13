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

## Changelog lines (for the Notion changelog)

- 13 Jul 2026 — Jobs made organisation-wide (one order = one number; methods
  route work to labs; batches stay lab-scoped). US-C1 AC 2/14, US-C2 AC 1,
  US-A5 AC 6, US-A7 AC 3, US-D1 AC 3 amended. Decided by Ramazan.
- 13 Jul 2026 — Admins made organisation-wide (no lab assignments; "All
  labs" switcher default). US-A3 AC 4, US-A6 AC 2 amended; US-A4 AC 7
  clarified. Decided by Ramazan.

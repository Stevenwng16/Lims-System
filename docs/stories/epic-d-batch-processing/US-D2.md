# US-D2 — Batch overview & work queue

*Status: written with Fable 5 (2 Jul 2026) — Ramazan's review pending · build: phase 3 — after US-D4 in build order (scope note §4: the queue should show real step data; document order is by ID, build order is not)*
> **User story**
> As a lab worker, I want one overview of all batches with where each one stands and who is on it, so that I can see what is waiting at my step, pick up work without duplicating a colleague's, and managers can spot bottlenecks at a glance.

*Scope note: this is the cross-batch view and the coordination layer (claiming/assigning). Batch behaviour itself lives in US-D3; statuses come from there. Source: epic D scope note §4 + answered question 1 (open pool + optional assignment ✅).*
**Acceptance criteria**
1. A **Batches** entry in the navigation (US-A3) lists all batches of the active lab: batch number, method (+ version), current step / status (US-D3 AC 8), positions (samples + QC), assignee (or *unassigned*), deadline, and creation date. Default sort: deadline ascending with overdue on top; batches without a deadline last.
2. Overdue batches carry a decoupled ⚠ flag (deadline passed, batch not completed) — same pattern as the job overview (US-C2): a flag, never a separate status.
3. **Default view shows open batches only** (at a step or awaiting review); *Completed* and *Voided* are hidden behind a toggle (US-C2 AC 10 pattern).
4. **Filters:** by current **step name** 🆕 (the distinct step names across the lab's active methods — "what is waiting at Digestion"), by status, by method, and by assignee (including *Mine* and *Unassigned* as one-click views). Free-text search on batch number. Filters combine.
5. A compact **summary strip** shows the lab's pulse: open batches · awaiting review · overdue · unassigned. Each count is clickable as a filter.
6. **Claiming (the pool):** a user who may work on a batch (US-D3 authorization) can **claim** an unassigned batch, setting themselves as assignee, and can release their own claim. 
7. 🆕 **Assignment coordinates, it never gates:** the assignee signals who is on it, but a cleared colleague can still act on the batch (US-D3 rights unchanged) — the UI warns ("assigned to J. Doe — continue?"), the server does not block. This keeps the open-pool spirit and avoids reassignment ceremony when someone is ill or busy.
8. **Assigning (manager):** Admin and Lab manager can assign, reassign or unassign any batch of their lab to any user who is allowed to work on it; assigning a user without clearance for the batch's method is blocked with a clear message.
9. Claim, release and (re/un)assignment are recorded in the append-only audit log with the organisation context.
10. The list never shows batches of another lab or organisation (US-A4 AC 7, invariant 5) — enforced server-side, not by filtering in the client.
**Frontend (UI)**
```plain text
Batches — Metals lab                    [+ New batch]
Open 12 · Awaiting review 3 · ⚠ Overdue 2 · Unassigned 5
──────────────────────────────────────────────────────────────
Filter: [Step ▾] [Status ▾] [Method ▾] [Mine] [Unassigned]  🔍
──────────────────────────────────────────────────────────────
Batch          Method (v)   Step / status      Pos.  Assignee   Due
MAINB26-0009 ⚠ Pb/Cd/Zn v3  2/4 Digestion      20    —          07-03
MAINB26-0007   Pb/Cd/Zn v3  3/4 Measurement    20    J. Doe     07-04
MAINB26-0008   Moisture v1  Awaiting review    12    A. Smith   07-05
                                   [ ] show completed & voided
```
Row click opens the batch detail (US-D3). *Claim* appears on unassigned rows for users who may work on them.
**Authorization**
- **View** — every role with access to the lab, including Read-only.
- **Claim / release own claim** — users who may work on the batch (US-D3 authorization: Admin, Lab manager, cleared Analysts).
- **Assign / reassign / unassign others** — Admin and Lab manager only.
- All enforced server-side (invariant 4).
**Definition of Done**
- All acceptance criteria met and verifiable.
- Step-name filter tested across two methods sharing a step name and one method with a unique step.
- Claim/release tested; assigning an uncleared user blocked server-side.
- Coordination-not-gating tested: a cleared non-assignee can act on an assigned batch after the UI warning.
- Defaults tested: open-only view, deadline sort with overdue on top, completed/voided behind the toggle.
- Summary-strip counts correct and clickable.
- Lab/organisation isolation verified server-side.
- All claim/assign events in the audit log.
**ISO 17025 / compliance**
- No direct clause — this is the workload-transparency screen. It supports **§7.1** (meeting agreed turnaround) via deadline visibility and gives management the overview §8 expects them to have in practice. Claim/assign attribution rides the normal audit trail.
**Later (Part 11 / growth)**
- Notification-centre integration (epic E): "batch stuck at step X for N days", "assigned to you".
- Auto-assignment rules and workload balancing.
- Saved filter presets per user.
- Organisation-wide multi-lab overview (dashboard territory, epic G).
- A smarter step taxonomy if step-name matching across methods proves too loose.

## Changelog — new story (source: epic D scope note)
- **New story.** Consumes answered question 1 ✅ (open pool + optional assignment by the lab manager) and the C2 list-page conventions (decoupled ⚠ flag, hidden-by-default rule, neutral examples).
- **Placement note:** written into the document at its ID position (D1 → D2 → D3 …) per Ramazan's ordering rule; the **build order is different** — after US-D4 — and the status line carries that explicitly, like B2/B3.
- Key decisions to review: (1) **assignment coordinates, never gates** (AC 7) — a cleared colleague can always take over; the UI warns, the server does not block. Alternative (hard gating on assignee) rejected: it forces reassignment ceremony for every sick day and contradicts the open-pool answer. (2) **Step filter matches on step name across methods** (AC 4) — assumes labs name shared steps consistently; per-method filtering exists alongside, and a formal step taxonomy is parked under Later. (3) Claiming requires the right to work on the batch; assigning an uncleared user is blocked (AC 6/8). (4) **No Developer decisions block** — deliberate: this story contains no fundamental choices; absence means "just build" (per the story anatomy on the main page).

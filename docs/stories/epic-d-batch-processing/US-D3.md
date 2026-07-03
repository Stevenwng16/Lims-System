# US-D3 — Batch detail & step workflow

*Status: written with Fable 5 — globally reviewed by Ramazan & frozen 2 Jul 2026 (deep catches during build via the amendment route) · build: phase 3 (epic D)*
> **User story**
> As a lab user, I want a batch page that shows exactly where the run stands and lets authorised people move it through its process steps — recording who did what, on which equipment, when — so that the batch record proves how the work was actually performed.

*Scope note: this story is the batch page and the step engine. Composition rules live in US-D1 (including the one-way latch, AC 10), data entry in US-D4, import in US-D5, review & completion in US-D6, the cross-batch queue in US-D2. Source: epic D scope note §3/§4.*
**Acceptance criteria**
1. Every batch has a detail page, reachable from the job's Batches tab (US-C3 AC 10), the work queue (US-D2) and directly after creation (US-D1). The header shows: batch number, method + pinned version, current position (step *x* of *n*, with step name), batch status (AC 8), sample/QC position counts, creator + creation date, the batch deadline (AC 9), and a download link to the working copy.
2. The page has four tabs, mirroring the job-detail pattern (US-C3): **Samples** (client samples with their per-method state; QC entries with quantity), **Steps** (the progress rail and transition history), **Files** (working copy, and uploads/import files as US-D4/D5 add them — all via the attachment facility), **History** (a read-only view on the audit log filtered to this batch; same principle as US-C3, never a separate copy).
3. The Steps tab shows the pinned method version's ordered steps (US-B1 AC 4) as a rail: completed steps (with who + when), exactly one **current** step, pending steps after it. The workflow is strictly linear in the MVP.
4. **Complete step (advance):** a user authorised to work on the batch completes the current step; the system records performer + timestamp and moves the batch to the next step. 🆕 If the step has required equipment types (US-B1 AC 8), completion requires selecting the **specific equipment item used per required type**, from that lab's items of that type: items with availability *Blocked* (US-B3 AC 6) cannot be selected and, if a required type has no selectable item, the step cannot be completed; *Due soon* items are selectable with a visible warning. The selection is stored on the step-completion record — the batch proves *which* balance, furnace or instrument was used.
5. Completing the **final** step moves the batch to **Awaiting review** (US-D6) 🆕 — gated on the completed worksheet being attached (US-D4 AC 9). Review is a system phase after the last method step, not a configurable step — so the review permission stays cleanly with US-A4 ("review and approve") instead of leaking into step configuration.
6. **Set back:** an Admin or Lab manager can move the batch back to any earlier step, with a **mandatory reason**, recorded as who/when/from → to/why. 🆕 A set-back returns the batch for **rework** and never reopens composition (mirror of US-D1 AC 10). Redoing a step creates a **new** completion record; the original completion stays visible in History — nothing is overwritten.
7. **Void batch:** an Admin or Lab manager can void a batch at any point before completion, with a mandatory reason. A voided batch is never deleted: it stays viewable with a clear banner, its files remain attached (retention follows the record), and its samples' per-method state returns to *Received* so they can be re-batched (US-D1 AC 4). Results already recorded on a voided batch remain in the record but can never be set *valid* (ADR-2).
8. **Batch status** is derived, never hand-set: *At step x* → *Awaiting review* → *Completed* (US-D6), or *Voided*. US-C3's Batches tab and US-D2 consume this status.
9. 🆕 The **batch deadline** is the earliest job deadline among its samples — informational, shown in the header, and used for sorting/⚠ flags in US-D2. No deadline on any sample's job = no batch deadline.
10. All transitions are enforced server-side: only the current step can be completed; a voided or completed batch accepts no transitions (viewing always works); equipment selection must match the required types and availability rules. Conflicting simultaneous actions (two users advancing at once) fail safely for the second user with a clear refresh message — shared lab terminals are the norm, not the exception.
11. Every transition (advance incl. equipment selection, set-back incl. reason, void incl. reason) is written to the append-only audit log with the organisation context; the History tab renders these entries.
**Developer decisions (this story)**
- **Choose here:** the representation of step-completion records (event rows vs state + audit). Requirements that must hold: append-only (a redo is a new record, AC 6), History stays a pure view (AC 2), and the AC 10 concurrency behaviour.
- *Non-binding advice:* reuse the ADR-2 pattern — current position as state on the batch, every transition as an audit event.
- **Log it:** one line in the Decision log.
**Frontend (UI)**
```plain text
Batch MAINB26-0007 — Pb/Cd/Zn in water (ICP-OES) v3      [⚠ due 2026-07-04]
Status: At step 2 of 4 — Digestion          Working copy ⬇   17 samples + 3 QC

[ Samples ] [ Steps ] [ Files ] [ History ]

Steps
  ✓ 1. Sample prep     — J. Doe, 2026-07-02 09:14
  ► 2. Digestion       [ Complete step ]  [ Set back ▾ ]
  ○ 3. Measurement
  ○ 4. Data entry
                                              [ Void batch ]
── Complete step 2 ─────────────────────────────
  Required equipment:
   Furnace   [ Furnace 2 (F-02) ▾ ]   ⚠ Furnace 1: check due soon
   Balance   [ Balance A (BAL-A) ▾ ]  (Balance B blocked — daily check failed)
                              [ Cancel ] [ Confirm ]
```
**Authorization**
- **View** — every role with access to the lab, including Read-only.
- **Complete step** — Admin, Lab manager, and Analysts cleared for the batch's method (US-A4 AC 6).
- **Set back / Void** — Admin and Lab manager only, always with reason.
- All of it enforced server-side (invariant 4); the assignment/claiming interplay arrives with US-D2 and never widens these rules.
**Definition of Done**
- All acceptance criteria met and verifiable.
- Full transition path tested: create → steps → awaiting review; advance blocked on non-current steps.
- Equipment gating tested: Blocked unselectable; required type with zero selectable items blocks completion; Due soon selectable with warning; selection stored on the step record.
- Set-back tested: reason mandatory; redo creates a new completion record with the old one retained; composition remains locked (US-D1 AC 10 latch).
- Void tested: samples return to *Received* and are re-batchable; results on the voided batch can never become valid; files retained.
- Concurrency tested: simultaneous advance by two users — one succeeds, one fails safely.
- All transitions in the audit log; History tab is demonstrably a view (no separate storage).
**ISO 17025 / compliance**
- **§6.4 / §7.5** — the step-completion record ties performer, time and the *specific equipment item* to the work: the core traceability this epic exists for.
- **§7.1** — deadline visibility supports agreed turnaround times.
- **ALCOA+** — *Attributable* and *Contemporaneous*: transitions are recorded at the moment of action, by the person acting; redo history is preserved, never overwritten.
**Later (Part 11 / growth)**
- Step-level duration thresholds feeding the notification centre (epic E) — "batch stuck at digestion for 3 days".
- Analyst-initiated set-back with Lab-manager approval.
- Parallel or branching step flows (MVP is strictly linear).
- Per-step data-entry windows (MVP: results may be entered any time before review, US-D4).
- Electronic signature on step completion.

## Changelog — new story (source: epic D scope note)
- **New story.** Written from the scope note (§3 kaders, §4 D3 row) plus the decisions of 1–2 Jul; consumes B1 AC 4 (steps), B1 AC 8 + B3 AC 6/10 (equipment gating), C3 AC 10 (Batches tab), and the answered question 7 (batch deadline = earliest job deadline).
- Key decisions to review: (1) **review is a system phase after the last step, not a configurable step** — keeps the review permission with US-A4 instead of leaking into step config; (2) **set-back is Lab manager/Admin only** with mandatory reason — deliberate: it is a corrective action, and the analyst-initiated variant is parked under Later; (3) **redo = new completion record**, originals retained (append-only applied to workflow); (4) **void until completion**, samples back to *Received*, results on a voided batch can never become valid; (5) **Due soon equipment is selectable with a warning**, Blocked never — matches B3's model; (6) data entry is deliberately **not** constrained to a specific step in the MVP.
- The set-back AC carries the **mirror rule of US-D1 AC 10** (composition latch) — the loophole Ramazan found is now closed from both sides.
- Developer decision registered: step-record representation (advice: ADR-2 pattern — state on the batch, transitions in the audit log).
- **AC 5 amended (2 Jul, with US-D4):** the transition to *Awaiting review* is gated on the completed worksheet being attached (US-D4 AC 9 — ADR-3, moment 2).

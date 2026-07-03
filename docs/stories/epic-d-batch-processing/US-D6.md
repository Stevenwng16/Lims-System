# US-D6 — Review & complete batch

*Status: written with Fable 5 — globally reviewed by Ramazan & frozen 2 Jul 2026 (deep catches during build via the amendment route) · build: phase 3 (epic D, closes the core loop)*
> **User story**
> As a lab manager, I want to review a finished batch — every result against its context, QC against expectations — and complete it with an explicit decision on every value, so that only reviewed results become the lab's answer and nothing leaves the batch by accident.

*Scope note: this story is the review phase (US-D3 AC 5: after the final step) and batch completion. Automated QC pass/fail and nonconforming-work records are epic E; the report itself and the §7.8.8 amendment flow are epic F — but the §7.8.8 trigger is designed here, per ADR-2. Source: epic D scope note §3/§4 + answered question 6 ✅.*
**Acceptance criteria**
1. A batch in *Awaiting review* opens a **review view**: the full result grid, read-only (entry is closed, US-D4 AC 10), showing per result its origin (`manual`/`worksheet`/`import`) and correction chain. 🆕 QC rows show the **expected value ± tolerance of the exact lot** (US-B2 AC 3) side by side with the measured values; Blank rows show the relevant reporting limit (US-B1 AC 3). The system deliberately renders **no pass/fail verdict** — automated evaluation is epic E; this story gives the human reviewer everything needed to judge.
2. **Who may review:** Admin and Lab manager (US-A4). 🆕 Per-lab setting **"reviewer must differ from the performing analyst(s)"** (default off; US-A7 AC 6): when on, a user who completed any step or entered/imported any result on this batch cannot review or complete it — enforced server-side. *(Answered question 6 ✅: segregation as a per-lab choice, not a hardcoded rule.)*
3. The reviewer sets each result to **valid** or **rejected**; rejecting requires a **reason**, and the rejected result + reason is the anchor epic E's nonconforming-work record will attach to. A bulk action ("validate all unflagged") exists for review-by-exception — UI convenience only: every result still receives its own status record with the reviewer's attribution.
4. 🆕 **No silent holes:** before completion the system lists every (sample × analyte) cell without a result. Each gap is either filled — via set-back (US-D3 AC 6), which reopens entry — or explicitly closed by the reviewer as **no result + reason** (ADR-2 value type d). Completion is impossible while unaccounted gaps remain.
5. **The rerun loop, stated honestly:** entry is closed during review, so re-measurement follows one route — set back with reason → measure/enter/import → complete the final step again → review again. A rejected value that will not be re-measured stands as rejected-with-reason; what gets reported is the *valid* set (epic F's consumption).
6. **Complete batch:** allowed only when every cell has a final state (valid, or rejected accompanied by a superseding valid value or an explicit no-result, or no-result). On completion: batch → *Completed*; the per-method state of its samples completes; a sample whose requested methods are now all completed becomes *Completed* (US-D1 AC 4); job status recalculates (US-C2 AC 7/12). The completion record (who, when) **is** the batch approval act.
7. QC results carry the same valid/rejected statuses as client results — one model (ADR-2); their judgement here is human, their automated evaluation arrives with epic E and reads these same records.
8. **After completion (ADR-2 post-approval rules):** results are locked for everyone except Admin/Lab manager, who can **replace** a result — a new record superseding the old, mandatory reason, original retained and visible. 🆕 **§7.8.8 trigger (designed now, built in epic F):** every post-completion replacement raises a persistent **"report impact — amendment check required"** flag on the batch and the result. Until epic F exists the flag is conservative (it always raises) and visible on the batch and in audit; epic F refines it to actual issued-report linkage and consumes it in the amendment flow.
9. There is no "reopen batch": completion is final as a workflow state. Corrections go through AC 8; a structural redo is a new batch (US-D1) — the record of the first one stands.
10. Every review decision (valid / rejected + reason), gap closure, completion, post-completion replacement and §7.8.8 flag is written to the append-only audit log with the organisation context.
**Frontend (UI)**
```plain text
Review — MAINB26-0007 · Pb/Cd/Zn v3 · awaiting review          reviewer: M. Vos
──────────────────────────────────────────────────────────────────────
              Pb (mg/L)        Cd (mg/L)        decision
MAIN...12.001  12.4             0.82            (•) valid  ( ) reject
MAIN...12.002  <0.010 ⟳         0.79            (•) valid  ( ) reject
BLK ×2         <0.010 | <0.010  <0.005 | <0.005  expected: < LOQ (0.010 / 0.005)
CS1            49.7             1.02             expected: 50.0 ±2.5 | 1.00 ±0.05
──────────────────────────────────────────────────────────────────────
Gaps: 1 — MAIN...14.001 × Zn   [ set back to fill ]  [ close as no result + reason ]
            [ Validate all unflagged ]      [ Complete batch ]  (blocked: 1 gap)
```
**Authorization**
- **Review, decide, complete, post-completion replace** — Admin and Lab manager, subject to the AC 2 per-lab segregation setting; replace always with reason.
- **Everyone else** — read-only on the review view and the completed batch.
- Server-side enforced (invariant 4).
**Definition of Done**
- All acceptance criteria met and verifiable.
- Segregation toggle tested in both states, including the server-side block on self-review when on.
- Per-result decisions tested; bulk path produces individual, attributed status records.
- Completeness gate tested: completion impossible with an unaccounted gap; both closure routes work (set-back refill, no-result + reason).
- Full rerun loop tested: reject → set back → re-enter → re-review → complete.
- Completion cascade tested: batch, per-method sample state, aggregate sample status, job status (multi-method sample completes only when all its methods do).
- Post-completion replace tested: LM/Admin only, reason mandatory, original retained, §7.8.8 flag raised and visible.
- QC side-by-side rendering verified incl. censored values and LOQ display.
- All events in the audit log.
**ISO 17025 / compliance**
- **§7.7** — ensuring validity of results: this human review is the MVP's §7.7 anchor until epic E automates the QC evaluation on the same records.
- **§7.8.8** — the amendment trigger is structurally in place before the first report exists: no reported value can ever be silently replaced.
- **§7.5 / ALCOA+** — review decisions attributable and contemporaneous; originals never disappear (RvA re-analysis practice honoured end to end).
**Later (Part 11 / growth)**
- Automated QC evaluation and decision rules on these records (epic E, with US-B4).
- Two-tier review (peer + approver) and review comments per result.
- Electronic signature on completion (Part 11: re-authentication via US-A1).
- The full §7.8.8 amendment flow (epic F) consuming the flag designed here.

## Changelog — new story (source: epic D scope note)
- **New story — closes epic D and the core loop.** Consumes answered question 6 ✅ (reviewer segregation as per-lab setting, default off — the matching toggle is added to US-A7 AC 6 in the same turn), ADR-2's post-approval rules, and the honest MVP boundary from the scope note: QC shown side-by-side, **no automated verdict** until epic E.
- Key decisions to review: (1) **the completeness gate** — nothing completes with a silent hole; every empty cell is filled via set-back or explicitly closed as no-result + reason; (2) **completion is the approval act** and is final — no reopen; corrections go through supersede-with-reason, structural redo is a new batch; (3) **the §7.8.8 trigger fires conservatively** in the MVP (every post-completion replacement flags "amendment check required") and epic F refines it to real issued-report linkage — designed now so no reported value can ever be silently replaced; (4) bulk validation exists but every result keeps its own attributed status record; (5) no Developer decisions block — nothing fundamental to choose here.

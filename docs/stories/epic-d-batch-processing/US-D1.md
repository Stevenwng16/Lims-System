# US-D1 — Create batch

*Status: written with Fable 5 — globally reviewed by Ramazan & frozen 2 Jul 2026 (deep catches during build via the amendment route) · build: phase 3 (epic D, after B2/B3)*
> **User story**
> As a lab manager, I want to assemble a batch from accepted samples with a pinned method version and the right QC materials, so that bench work starts from a complete, validated run definition and everything that follows is traceable to it.

*Scope note: this story creates the batch and its composition. Step workflow and batch void live in US-D3, data entry in US-D4, instrument import in US-D5, review & completion in US-D6, the work queue in US-D2. Source: the epic D scope note (§3, §4, §6).*
**Acceptance criteria**
1. A batch is created for exactly one **active method of the user's lab** (US-B1). The method's **latest active version is pinned** at creation (US-B1 AC 9), shown on the batch, and can never change afterwards — the batch is permanently bound to that method version, template included (US-B1 AC 6).
2. The batch number is generated from a configurable format (US-A7 AC 3; default `{LAB}B{YY}-{SEQ:0000}`, e.g. `MAINB26-0001`), is unique within the organisation, immutable once issued, and its sequence runs per organisation + lab (+ reset period), like all other identifiers.
3. **Sample eligibility (server-side):** a sample can be added only if it (a) belongs to the same lab as the batch, (b) has acceptance decision *Accepted* or *Accepted with reservation* (US-C1 AC 7 — *Rejected* and undecided samples never), (c) is not voided, and (d) is not already in another **open batch for the same method**. 🆕 A sample **may** be in open batches of *different* methods at the same time — multi-analysis jobs run in parallel; the one-open-batch rule applies per method, to prevent double work.
4. 🆕 **Per-method progress model:** batch membership is tracked per (sample × method). A sample's status (US-C1 AC 9) is the aggregate: *Received* (in no open batch), *In progress* (in ≥1 open batch), *Completed* only when **every requested method** of the sample has been completed (US-D6). Job status (US-C2 AC 7) derives from these aggregates unchanged.
5. The sample picker defaults to samples whose **requested methods include the batch's method** (US-C1 AC 5/14). Adding a sample without that request is possible after an explicit confirmation, which **adds the method to the sample's requested methods** (recorded) — so job completeness stays meaningful.
6. **Capacity:** 🆕 the method's maximum batch size (US-B1 AC 5) is the number of **occupied positions**: client samples **plus** QC positions (the sum of QC quantities, AC 7) — capacity is a physical run limit, and blanks and controls occupy positions like any sample. A live counter shows the breakdown (e.g. "18/20 — 15 samples + 3 QC"); exceeding is blocked server-side.
7. **QC selection:** the picker offers only materials that are active, not expired, of the same lab, and covering ≥1 of the method's analytes by name + unit (US-B2 AC 6/9). Each added QC entry is the material at its specific lot (US-B2 AC 7). A material is added **once per batch, with a quantity** 🆕 (default 1; e.g. blank ×2 for start and end of the run) — each unit occupies a position (AC 6). The import (US-D5) matches all rows carrying that material code to the entry; the preview flags a mismatch between row count and quantity as a notice, not a block. Creating a batch with zero QC gives a warning, not a block (required-QC-per-method enforcement arrives with US-B4/epic E).
8. **Working copy (Excel):** at creation the system generates the batch's working copy from the pinned template version (US-B1 AC 6) via the attachment facility, records its checksum (ADR-4), and makes it downloadable from the batch. 🆕 The working copy includes a generated **batch sheet**: batch number, method + version, creation date, and the ordered list of sample IDs and QC codes (US-B2 AC 2) — template formulas may reference it. *(Honours the original v0 decision: Excel auto-generation per batch.)*
9. On creation the batch enters the **first process step** of the method (US-B1 AC 4); the per-method state of its samples moves to *In batch* (AC 4).
10. **Composition editing — one-way latch:** 🆕 samples and QC entries can be added or removed only while the batch has never left its first step **and** no work has been recorded (no step advance, no results, no uploads). The moment either happens, composition locks **permanently** — setting steps back (US-D3) is for rework and never reopens composition. After the latch: a sample that cannot continue is closed out via a *no result* with reason (ADR-2, US-D4/D6) and stays visibly part of the run; a wrongly composed batch is voided (US-D3). A formal amendment flow with approval is Later. Removing a sample in the open window returns its per-method state to *Received*; all composition changes are audited.
11. 🆕 **Reagent-lot hook (design constraint):** the batch data model reserves a batch ↔ reagent-lot relation. The reagent-lot administration itself is the post-MVP story from the candidate list (§6.4.1); nothing else in this story depends on it.
12. Validation: a method is chosen; ≥1 sample; capacity respected; every sample passes AC 3 — all enforced server-side. Invalid batches cannot be created.
13. Batch creation and every composition change are written to the append-only audit log with the organisation context (who, what, when); the batch record permanently carries its creator and creation timestamp.
**Developer decisions (this story)**
- **Choose here:** the representation of per-(sample × method) progress (explicit state table vs derived from open-batch membership + results). Requirement that must hold: the AC 4 semantics and the existing US-C2/C3 status derivations stay correct.
- *Non-binding advice:* derive, don't store — compute from open-batch membership and valid results, consistent with ADR-2's "current result is a view" philosophy.
- **Log it:** one line in the Decision log.
**Frontend (UI)**
```plain text
New batch — Metals lab
┌───────────────────────────────────────────────────────────┐
│ Method   [ Pb/Cd/Zn in water (ICP-OES) — v3 ▾ ]  20 pos.   │
│                                                            │
│ Samples (7)                            [filter: requested] │
│  [x] MAIN26-00012.001  Water   Accepted                    │
│  [x] MAIN26-00012.002  Water   Accepted w/ reservation ⚠   │
│  [x] MAIN26-00014.001  Water   Accepted                    │
│  [ ] MAIN26-00015.003  Soil    Accepted   (not requested)  │
│                                                            │
│ QC (2 · 3 pos.)                 Positions used: 10/20      │
│  [x] BLK  — Reagent blank                        [×2]      │
│  [x] CS1  — Control std   lot 2026-03  exp 2026-11 [×1]    │
│                                                            │
│ Working copy: generated on create (template v3, checksum)  │
│                                    [ Cancel ]  [ Create ]  │
└───────────────────────────────────────────────────────────┘
```
After *Create*: batch `MAINB26-0007` at step 1 — *Sample prep*; batch detail opens (US-D3).
**Authorization**
- **Admin / Lab manager** — create batches and edit composition within their lab(s) (US-A4 AC 5).
- **Analyst** — only if the per-lab setting "Analysts may create batches" is on **and** they are cleared for the chosen method (US-A4 AC 5/6); same limits for composition editing.
- **Read-only** — no access.
**Definition of Done**
- All acceptance criteria met and verifiable.
- Eligibility tested server-side for every exclusion: rejected, undecided, voided, wrong lab, already in an open batch of the same method.
- Multi-method parallelism tested: one sample simultaneously in two open batches of different methods, statuses correct throughout.
- Capacity block tested at the boundary including QC positions (e.g. 17 samples + 3 QC positions = 20 ok; one more of either blocked).
- Version pinning tested: publishing a new method version after creation changes nothing on the existing batch.
- Working-copy generation tested: correct template version, checksum recorded, batch sheet contains the exact composition.
- Zero-QC warning shown but not blocking.
- Composition latch tested: after a step advance and a set-back to step 1, composition remains locked.
- All creation/composition events in the audit log.
**ISO 17025 / compliance**
- **§7.2 / §8.3** — work is performed under a pinned, validated method version; the batch proves *which* version.
- **§7.4** — only samples that passed the acceptance gate can enter testing.
- **§7.5** — the batch is the technical record tying samples, method version, QC and (from US-D3) equipment together.
- **ALCOA+** — *Complete/Consistent*: the run definition is captured at creation and immutable in the parts that matter (number, version).
**Later (Part 11 / growth)**
- Formal composition-amendment flow after work has started (with reason + approval).
- Required-QC-set per method, enforced (with US-B4 / epic E).
- Multi-batch instrument runs with automatic routing + QC position IDs (deliberately parked — scope note §6).
- Auto-suggest composition from the oldest waiting samples.
- Reagent-lot administration filling the AC 11 hook (post-MVP story, §6.4.1).

## Changelog — new story (source: epic D scope note)
- **New story, no v1/v0 counterpart to rebuild** — written from the scope note (§3 bindende kaders, §4 story table, §6 import/QC decisions). The v0 core decisions are honoured: method at batch level (AC 1), Excel auto-generation per batch (AC 8), manual QC selection (AC 7).
- **The one genuinely new design in this story — please review AC 3+4:** the **per-method progress model**. A sample requested for two analyses sits in two batches *at the same time* (different methods), with "one open batch per method" preventing double work; the sample's single status becomes an aggregate (*Completed* only when all requested methods are done). Without this, multi-analysis jobs would be forced sequential — unworkable in a real lab. C1 AC 9 anticipated this ("lifecycle owned by epic D"), so no C-amendments needed.
- Other decisions to confirm: QC material **once per batch with a quantity** (all import rows with that code match the entry; position bookkeeping stays out of the MVP, per scope note §6); composition **locks** after step 1 / first data; confirming a non-requested sample **adds the method to its requested list**; zero-QC = warning.
- **Correction (2 Jul 2026, Ramazan — bench experience):** capacity = **total occupied positions**, client samples + QC included. The first draft counted client samples only — wrong: it could compose physically impossible batches (20 samples + 5 QC in a 20-position run) and, combined with quantity-less QC entries, would undercount a blank measured at start *and* end. AC 6/7, the sketch, the DoD and US-B1 AC 5 rewritten accordingly.
- **AC 10 hardened (2 Jul 2026 — loophole found by Ramazan):** the original lock ("at step 1 and no data") could be laundered via set-backs: do work, set everything back to step 1, edit. Now a **one-way latch**: composition locks permanently at the first step-advance or recorded work — from the first moment of work the batch is exactly as immutable as full immutability-after-creation, while keeping the cheap correction window for compositions caught before any work (mis-batching is common in practice). Mid-run removals are data events (*no result* + reason), not composition edits, so the run record stays truthful; adding a sample after step 1 is physically meaningless and stays impossible. Full immutability-after-creation was considered and rejected: it forces a void/recreate cycle for every pre-work slip.
- **US-A7 AC 3 amended in the same turn** (deliberate frozen-story amendment, same route as AC 9): batch-number template added, default `{LAB}B{YY}-{SEQ:0000}`.
- Developer decision registered: per-method progress representation (advice: derive, don't store).

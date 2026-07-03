# US-C1 — Create job & register samples

*Status: written with Opus 4.8 — reviewed with Fable 5, amended & approved 1 Jul 2026 · build: phase 2*
> **User story**
> As a lab manager, I want to register an incoming job with its samples — recording who received them, in what condition and whether they're accepted — so that traceability starts at the moment of receipt and the lab meets ISO 17025 §7.4.

*Scope note: a job belongs to exactly one lab (US-A5), which belongs to one organisation (invariant 5); job and sample visibility never cross the organisation boundary. This story covers receipt + registration as one action. Sample retention & disposal (end of the sample's life) is a separate later story in epic C — only the storage-location hook lives here. A full customer/client entity (vs the free-text fields here) is future scope, feeding the portal in epic F.*
**Acceptance criteria**
1. Authorized users (Admin, Lab manager) create a job. The job header captures: customer name, optional customer reference, the lab, **date + time of receipt**, **received by** (auto-filled with the logged-in user), requested method(s), optional priority / due date, and notes.
2. The job number is generated automatically from the configured format (US-A7), is **unique within the organisation**, and is **never changed or reissued** once created. Sequences run per organisation + lab (US-A7).
3. A job belongs to exactly one lab (US-A5) within one organisation and is subject to lab scoping (US-A4) and organisation isolation (invariant 5).
4. One or more **samples** are registered under the job. Each sample receives a unique sample ID generated from the configured sample-number format (US-A7), which is **immutable** once issued. 🆕 With the default format ({JOB}.{SEQ:000}) the sample sequence restarts per job. *(The term is "sample", not "lot".)*
5. Per sample, the user records: **sample type** (from the organisation's configurable sample-type list — e.g. Water, Soil, Product; the list itself is managed in Settings, US-A7 AC 9 🆕), description/matrix, optional customer sample reference, optional quantity + unit, and requested method(s) (defaulting from the job, overridable per sample).
6. **§7.4 — condition on receipt:** per sample, the user records the condition on receipt with a **deviation flag** and a free-text deviation note (default condition: "conforming"). An optional photo/attachment can be added as evidence of a deviation, stored via the central attachment facility (ADR-3).
7. **§7.4.3 — acceptance decision (hard gate):** each sample is set to **Accepted**, **Accepted with reservation**, or **Rejected**. A sample **cannot be placed in a batch (epic D) until it has an acceptance decision**. A Rejected sample can never enter a batch. "Accepted with reservation" requires a reason, and the reservation is carried forward so the report (epic F) can include the required disclaimer.
8. **§7.4.3 — customer consultation:** when the user marks that the sample **does not match its description** or that its **suitability is in doubt**, recording a customer consultation (who, when, outcome) is **required** before the sample can be accepted. For ordinary cosmetic deviations the lab may accept on its own judgement (a consultation can be recorded but is not forced). This supports the route of proceeding at the customer's request with a documented disclaimer (carried via "Accepted with reservation").
9. Each sample has a **status** that starts at **Received** on acceptance. The lifecycle (Received → In batch → In progress → Completed) is owned by epic D; the field originates here, giving sample-level tracking from the start. 🆕 A Rejected sample never enters this lifecycle: its acceptance decision is its end state.
10. Optional **storage location** per job or sample, supporting "where is my sample" tracking (§7.4.1 handling). This is the hook the later retention & disposal story (epic C) builds on.
11. The unique sample ID is barcode-encodable; the actual label printing is US-C4, but the ID and its encoding are defined here.
12. **Editing & traceability:** job and sample details can be edited by authorized users, but the job number and sample IDs never change, and every edit is recorded with before/after in the append-only audit log (organisation context).
13. **Void, never delete:** a sample or job registered in error is **voided/cancelled with a reason** and retained for the record, never hard-deleted.
14. Validation: a job has at least one sample; required header and per-sample fields are present; 🆕 requested methods must be active methods of the job's lab (US-B1); each sample has an acceptance decision before batching. Invalid jobs cannot be saved.
15. Every action (job created, sample added, edit with before/after, acceptance decision, customer consultation, void) is written to the append-only audit log with the organisation context, recording who, what and when. The §7.4 receipt details (date/time, receiver, condition, deviation) are part of the permanent record.
**Frontend (UI)**
```plain text
New job                                                  Job no: MAIN26-00042 (auto)

  Customer        [ Acme Water Authority      ]   Ref [ PO-7781 ]
  Lab             [ Environmental lab ▼ ]
  Received        2026-06-09  14:20    Received by: (current user)
  Requested method[ ICP-OES metals in water ▼ ]   Priority [ Standard ▼ ]
  Notes           [ … ]

  Samples                                                      [ + Add sample ]
  Sample ID         Type      Description     Cond.   Deviation     Acceptance
  ─────────────────────────────────────────────────────────────────────────────────
  MAIN26-00042.001  Water ▼   Inlet           OK      —             Accepted ▼
  MAIN26-00042.002  Water ▼   Outlet          ⚠       Leaking cap   Accepted w/ reservation ▼
  MAIN26-00042.003  Soil ▼    Bank sediment   ⚠       Wrong matrix  (decision blocked →)

  ⚠ Sample .003 marked "does not match description" → [ Record customer consultation ] required
  ⚠ Sample .002: reason required; reservation carries to report

                                          [ Cancel ]   [ Register job ]
```
**Authorization**
- **Admin / Lab manager** — create and manage jobs and register samples within their lab(s); record acceptance decisions and customer consultations.
- **Analyst** — view jobs and samples within their lab(s); does **not** create jobs or register samples (consistent with US-A4).
- **Read-only** — view only.
**Definition of Done**
- All acceptance criteria met and verifiable.
- Global invariants honoured and tested where applicable (append-only audit with before/after, void-not-delete, server-side enforcement, organisation isolation).
- §7.4 receipt data captured: date/time, receiver, condition, deviation, acceptance decision, and customer consultation where applicable.
- **Hard gate verified by test:** no sample can enter a batch without an acceptance decision; a Rejected sample is always blocked.
- "Accepted with reservation" requires a reason and exposes the reservation flag for the epic-F disclaimer.
- Customer consultation is forced only on "does not match description" / "suitability in doubt", not on ordinary deviations — verified in both paths.
- Unique, immutable job numbers and sample IDs verified (unique within the organisation).
- Generic, configurable sample types verified (not tied to any one matrix).
- Optional deviation photo stored via the central attachment facility.
- Void-not-delete verified; voided records retained and attributable.
- All actions appear in the audit log with before/after on edits.
**ISO 17025 / compliance**
- **§7.4** — handling of test items: receipt, condition recording, deviations, acceptance/rejection decision and customer consultation.
- **§7.5** — technical records: this is the start of the record chain for a sample.
- **§7.8.6** — an accepted deviation feeds the mandatory disclaimer in the later report.
**Later (Part 11)**
- Electronic signature on the acceptance/rejection decision.
- Locked, signature-controlled customer-consultation records.
**Future scope (post-MVP, not Part 11)**
- Sample retention period & disposal — a separate small story in epic C (the storage-location field here is its hook).
- Expected / pre-registered samples (announced before physical arrival) — the two-phase "what's coming" view.
- A full customer/client entity (instead of free-text fields), feeding the customer portal in epic F.
- Chain-of-custody transfer events and storage-condition monitoring.

## Changelog vs v1 (was: US-C1)
- **Cross-references renumbered** to v2: lab = US-A5, lab scoping = US-A4, identifier formats = US-A7, barcode printing = US-C4, batch workflow = epic D, report/disclaimer = epic F.
- **Organisation context** added throughout (invariant 5): job unique within the organisation, sequences per organisation + lab, organisation isolation on visibility and audit.
- **AC 7/8 — acceptance model sharpened (review decision):** the hard gate sits on "every sample has an acceptance decision before batching" (always), while **forced customer consultation is triggered by the *type* of deviation** — only when the sample does not match its description or suitability is in doubt, not on every cosmetic deviation. This is the agreed nuance: strict where it counts, not blunt.
- **AC 6 — optional deviation photo** via the central attachment facility (ADR-3).
- **Retention & disposal split out:** moved from "future scope bullet inside C1" to an explicit separate later story in epic C; only the storage-location hook (AC 10) stays here.
- **Deliberately unchanged:** "sample" not "lot", immutable job/sample IDs, the Received→…→Completed lifecycle owned by epic D, void-not-delete, and the new-job UI sketch (which only gained the consultation/blocked-decision prompts).
- **Fable 5 review (1 Jul 2026) — approved with three small amendments:** (1) **AC 5:** the sample-type list now has a home — organisation-level configuration in Settings (new US-A7 AC 9); it was referenced but managed nowhere. (2) **AC 14:** requested methods must be **active methods of the job's lab** — methods are lab-scoped (US-B1), and nothing prevented requesting a method from another lab. (3) **AC 4:** clarified that the sample sequence restarts per job under the default format. The §7.4 acceptance model — hard gate on every sample, consultation forced only by deviation *type* — confirmed as written; that nuance is exactly right.

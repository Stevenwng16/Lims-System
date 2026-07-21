# PROJECT_STATE — complete as-built snapshot

**Date:** 17 Jul 2026 (updated after the same-day gap-closure session, commits `87b327f`…`936c55f`) · **State of:** branch `Ramazan` · **Written for:** documentation repair and further story writing (self-contained; no repo access assumed).

**Read this first.** Everything described here is a **frontend prototype against an in-memory mock** — a deliberate decision (decision log, 3 Jul 2026) while the partner-built backend's spec is unknown. There is **no database and no real auth provider** in this repository; the audit trails and the 46-test invariant suite (added 17 Jul) exist at mock level only — state still dies on dev-server restart, so nothing is *persistently* audited. Wherever this document says "done", read "**done at mock level**": the UI flow and the rule logic exist and behave per the acceptance criteria against `lib/mock-db.ts`, but nothing is persistent, server-hardened (the session cookie is forgeable, §6), or durably stored. Every rule listed below must be re-enforced by the real backend.

---

## 1. Purpose and target users

Multi-tenant SaaS **LIMS (Laboratory Information Management System)** for **ISO 17025-accredited SME laboratories** in the Netherlands (RvA accreditation market). Core promise: a lab sells provably reliable measurements — every design choice must survive the question **"can we prove it afterwards?"**

Users:
- **Customer organisations** (labs): Admin, Lab manager, Analyst, Read-only — a fixed four-role matrix (US-A4).
- **Vendor staff** (platform level, invisible to customers): Platform admin — provisioning, org lifecycle, consent-based support access (US-A2).

The domain flow built so far: customer order (**job**) with **samples** → per-sample **acceptance decision** (§7.4.3 gate) → lab-scoped **batches** per **method (version)** → step-by-step execution with **equipment** gating and **QC materials** → **result entry** (manual, paste, worksheet, instrument import) → human **review** → batch completion. Reports/CoA (epic F), QC auto-evaluation & nonconforming work (epic E) and dashboards (epic G) are **not built** — only their hooks are.

## 2. Stack and architecture

- **Next.js 16 (App Router, Turbopack) + React 19 + TypeScript**, Tailwind 4, shadcn-style components over **Base UI** (`@base-ui/react`) in `components/ui/`. Only runtime domain dependency: `exceljs` (server-side Excel text extraction).
- **All domain logic lives behind swap-point interfaces**: `lib/<area>/types.ts` defines an `…Api` interface, `lib/<area>/mock.ts` implements it against the in-memory store, `lib/<area>/index.ts` is the adapter switch. Areas: `auth`, `platform`, `labs`, `users`, `settings`, `methods`, `qc`, `equipment`, `jobs`, `batches`. The real backend replaces the mocks behind the same interfaces.
- **The store** (`lib/mock-db.ts`): one module-level object cached on `globalThis` under a versioned key (`__limsMockDbV29r{SEED_RESET}{Clean}`), so it survives HMR and resets on restart. Two seed modes: `LIMS_CLEAN_SEED=1` in `.env.local` (current setting) = empty platform with only `vendor@lims.dev`; unset = full demo dataset (Demo Lab org with methods, equipment, QC, jobs, batches). Dev knob `SEED_RESET` (bottom of `lib/mock-db.ts`): bump the number → running server abandons state and reseeds without restart.
- **Auth**: mock by default. `lib/auth/index.ts` switches to a **Supabase adapter** (`lib/auth/supabase.ts`) when `NEXT_PUBLIC_SUPABASE_URL` is set — it is currently **commented out**, so Supabase is **scaffolded but inactive**. Supabase migrations/config exist in `lims-supabase/supabase/` (auth schema, audit log, token hook + RLS) — written 4–5 Jul, unused since. Only auth has a Supabase adapter; every other area is mock-only.
- **Routing/session**: `proxy.ts` (Next middleware) gates unauthenticated access, separates the vendor console (`/platform`) from the customer app, and re-issues the sliding session cookie. Sessions are **unsigned base64url JSON cookies** (`lib/auth/session.ts`, explicitly "NOT tamper-proof"); `lib/auth/context.ts` re-validates every request against the live store — that resolver, not the cookie, is the real boundary in the mock.
- **Org routing is session-bound** — no organisation in URLs (decision 3 Jul); a user belongs to exactly one org.
- Demo accounts (demo seed): `admin@demolab.nl`, `labmanager@demolab.nl`, `analyst@demolab.nl`, `vendor@lims.dev` — password `LabDemo2026!!`; MFA demo code `123456`; reset token `demo-reset-token` (printed to console).
- Run: `npm run dev` (port 3000). Scripts: `dev`/`build`/`start`/`lint`/`test`/`test:watch` (Vitest invariant suite, both seed modes).

## 3. The seven compliance invariants — current enforcement

Each: where/how enforced **in the mock**, or explicitly not. (Real-backend enforcement: nothing yet, everywhere.)

**1. Append-only audit log (who/what/when, before/after on edits)** — *enforced (mock level; gap closed 17 Jul 2026).*
- Per-entity append-only `events[]` arrays + helper functions everywhere: platform actions → `recordPlatformAction` (`lib/platform/mock.ts`); org settings → `logSettingsEvent` (`lib/settings/mock.ts`); users → diff + `events.push` (`lib/users/mock.ts`); jobs → `addJobEvent` (`lib/jobs/mock.ts`); batches → `addEvent` on every transition (`lib/batches/mock.ts` — the History tab is a pure projection of this log); equipment (incl. check-type changes) → `addEvent` (`lib/equipment/mock.ts`); import configs; measurement validity flips → batch events; **since 17 Jul also labs → `addLabEvent`, methods → `addMethodEvent`, QC materials → `addQcEvent`, and equipment types** (creation, before→after edit diffs, status changes with reason). `status`/`statusReason` on records is the current-state projection; `events[]` is the authoritative history. Guarded by `tests/invariants/append-only.test.ts`.

**2. Never delete** — *enforced.* No `.delete()` on any domain map. Patterns everywhere: orgs suspend/deactivate with reason; labs/methods/QC/equipment deactivate with reason; jobs/samples/batches **void** with reason; list items `active:false`. The single `users.delete()` (`lib/users/mock.ts`) is a re-key on email change (same record re-inserted; batch claims re-pointed) — not a deletion. Ephemeral staging maps (`pendingImports`, `pendingBulk`, MFA tokens) legitimately delete one-use tokens.

**3. Version, don't overwrite** — *enforced for the defined cases.* Methods: editing a batch-used method appends a new `MethodVersion` (deep-copied history, no-op edits suppressed) — `lib/methods/mock.ts` `updateMethod`/`buildVersion`. Templates: `replaceTemplate` always appends a `TemplateVersion`; on a used method also pins a new method version. Worksheets: re-upload appends to `batch.worksheets[]`. Results: a correction is a **new** `MockMeasurementRecord` with a `supersedes` pointer + mandatory reason; batches pin `methodVersion`/`templateVersion` at creation.

**4. Server-side enforcement** — *enforced at mock level, with one structural caveat.* Every server action re-derives identity/role/org from the live store, never trusting the cookie alone: `resolveOrgContext` (`lib/auth/context.ts`), `requirePlatformAdmin` (`app/platform/actions.ts`), `requireAdminOrgId` (settings/labs actions), plus per-API actor checks (`canManage`/`canWorkBatch`/clearance checks) inside each mock. `proxy.ts` is flow-control only. **Caveat:** the cookie is unsigned; a forged cookie is only caught because the resolver re-validates against the in-memory store. Real signing/sessions are backend work.

**5. Tenant isolation** — *enforced.* `orgId` on every entity; jobs and batches stored under org-composite keys (`"<orgId>:<number>"`, `jobKey`/`batchKey`) so org-unique numbers cannot collide across tenants; every read filters/re-checks `record.orgId === actor.orgId`; ID sequences are org-scoped (`job:<orgId>:<period>`, `batch:<orgId>:<labId>:<period>`, `sample:<orgId>:<jobNumber>`). The only cross-org reads are the vendor console's org *metadata* list and the consent-gated support-session path (live-validated, US-A2).

**6. Attributability** — *enforced (mock level; gap closed 17 Jul 2026 with invariant 1).* Actor email is threaded into every audited mutation (`actorEmail`/`actor.email` params — required at the type level, so anonymous mutations don't compile) and stored on records: `createdBy`, `receivedBy`, `enteredBy`, `performedBy`, `uploadedBy`, `validitySetBy`, `outOfService.by`, and every `events[]` entry's `by`. No shared accounts; platform actions attribute the live vendor identity. Guarded by the invariant suite.

**7. Configurable over hardcoded** — *enforced (last two misses wired 17 Jul 2026).* Wired org settings: lockout threshold, require-MFA, min password length, identifier formats + sequence reset, sample types, result qualifiers, job label (rename "Job" everywhere), barcode layout, calibration warning window, per-lab workflow toggles (`analystsMayCreateBatches`, `reviewerMustDiffer`), **`sessionTimeoutMinutes`** (resolved at login, embedded in the session payload, re-used by sliding renewals — changes apply from the next login; platform staff fixed at 30 min; `lib/auth/ttl.ts`) and **`requireComplexity`** (3-of-4 character classes via the shared `passwordPolicyError`, `lib/auth/password.ts`, enforced at every password-set path).

**Measurement values (hard rule):** all numeric values are **decimal strings at full entered precision**, end to end (`ResultValue`, LOQ, tolerances, check values, quantities). Locale-aware strict parsing rejects ambiguous input (`lib/batches/parse.ts`, ADR-4 "reject, never guess" — including the thousands-separator ambiguity rule and the same strictness for dd-mm-yyyy dates in `components/ui/date-input.tsx`). Comparisons run on scaled **BigInt** cross-multiplication, no floats or division (`lib/equipment/decimal.ts`). **Reporting-time rounding (round half up to `MethodAnalyte.decimals`) is NOT implemented anywhere** — deferred with epics E/F; today values display at full precision.

## 4. Data model (as in `lib/mock-db.ts`)

Top-level `MockDb`: Maps `organisations, users, labs, orgSettings, methods, qcMaterials, equipment, equipmentTypes, jobs, batches, importConfigs, sequences` + array `platformAudit[]` + ephemeral `pendingImports`/`pendingBulk` (one-token preview→confirm staging) + `batchFiles` (file bytes kept out of records).

| Entity | Key fields / notes | Audit |
|---|---|---|
| `MockOrganisation` | id, name, status (`active/suspended/deactivated`) + statusReason, subscription, `setupPending`, `supportGrant` (timestamps, liveness derived) | history in `platformAudit[]` |
| `MockPlatformEvent` | platform-level audit log: at, by, orgId, summary — append-only (US-A2 AC 3; read UI = epic E) | — |
| `MockLab` | id, orgId, name, **code** (stamped into batch numbers), status+reason, `hasActiveWork`, per-lab toggles | `events[]` (17 Jul) |
| `MockUser` | email (key), orgId (null = platform staff), role, `labs[]` (names; empty for admins), `clearances[]` (method ids), status, password/MFA/lockout fields | `events[]` |
| `OrgSettings` | security, identifier formats + sequenceReset, jobLabel, `sampleTypes[]`, `resultQualifiers[]`, barcode, equipment window | `settingsEvents[]` |
| `MockMethod` | id, orgId, status+reason, `usedByBatches`, **`versions[]` append-only** (each: code, labId, steps with required equipment types + validation rule, analytes with unit/decimals/LOQ, pinned templateVersion), **`templates[]` append-only** (sha256) | `events[]` (17 Jul) + versions carry createdBy |
| `MockJob` | id = job number (immutable, **organisation-wide** — no labId since 13 Jul), customer, receivedAt/By, requestedMethodIds, priority, dueDate, `samples[]`, voided+reason | `events[]` |
| `MockSample` | id (immutable, `{JOB}.{SEQ}`), typeId, deviation fields, **acceptance** (§7.4.3: null/accepted/with-reservation/rejected), consultation, attachments, voided+reason; **lifecycle status is DERIVED from batch membership, never stored** | on parent job |
| `MockBatch` | id = batch number (**lab-scoped**, `{LAB}B…`), orgId, labId, methodId + **pinned** methodVersion/templateVersion, status (`open/awaiting-review/completed/voided` — phase derived from events), currentStepIndex, `compositionLatched` (one-way), assignee, sampleIds, `qc[]` (with **frozen expectation snapshots**), workingCopy (sha256), `worksheets[]`, **`results[]` append-only**, `imports[]` (self-contained snapshot + source file), `events[]` | `events[]` = the workflow history |
| `MockMeasurementRecord` | target (sample/qc) × analyte × methodVersion, `value` (numeric/censored/qualifier/text/no-result — decimal strings), origin (manual/paste/worksheet/import), enteredBy/At, `supersedes` + mandatory reason, **`validity`** (`pending/valid/rejected` — the one sanctioned status column, flipped only by review) | via batch events |
| `MockQcMaterial` | id, orgId, labId, code (import matching), type (blank/control/CRM), lot/expiry, certificate, `expectedValues[]` ± tolerance | `events[]` (17 Jul) |
| `MockEquipment` | id, orgId, labId, **assetId** (org-unique, never reissued), typeId, calibration (due dates, certificate), `checkTypes[]` (frequency + numeric/manual criterion), **`checks[]` append-only**, `methodLinks[]`, outOfService, status+reason; **availability (Available/Due soon/Blocked) is derived, never stored** | `events[]` |
| `MockImportConfig` | id, orgId, labId, file type/orientation/column mappings, **declared** decimal separator + CSV delimiter | `events[]` |
| `sequences` | org-scoped counters: job per org+period, batch per org+lab+period, sample per job | — |

Relationships: everything hangs off `orgId`; labs ← methods (per version), equipment, QC materials, batches, import configs; **jobs are org-level** and relate to labs only through their requested methods (each method's lab routes the work); batches reference samples across any jobs of the org.

## 5. Feature status per epic

Status vocabulary: **done (mock)** = flows + rules work against the mock per the ACs; **partial** = stated part missing; **not started**. All 20 backlog stories (US-A1…US-D6) have been built and adversarially reviewed in four review passes (6–13 Jul, see `docs/review-progress.md`); the per-AC detail below lists the known exceptions.

### Epic A — Platform & access (US-A1…A7) — done (mock), with partials
- **US-A1 auth**: login + generic failure + lockout (configurable threshold) + org-suspended gate — done (mock). **Partials:** MFA is a hardcoded demo code (no TOTP enrolment); password reset uses a static console-printed token, changes no password (clears lockout only), ends no sessions; no auth-event log (logins/failures are counted, not recorded). `sessionTimeoutMinutes` and `requireComplexity` are wired since 17 Jul. Files: `app/(auth)/*`, `lib/auth/*`, `proxy.ts`.
- **US-A2 organisations & platform**: provisioning (creates org + settings + **first admin account**, mock-preset password), suspend/reactivate/**deactivate** with reason, **platform-level append-only audit log** (`platformAudit`), consent-based support access (customer grants, time-boxed, optional admin rights; vendor opens session; banner; instant revoke) — done (mock). Support actions are **not yet written to the customer's own audit log** (epic E hook). Files: `app/platform/*`, `lib/platform/*`, `app/(app)/settings/support-access/*`.
- **US-A3 shell/navigation**: sidebar per capability matrix, org + lab switcher in header, system-message area, session-expired handling — done (mock). **Amended 13 Jul:** admins are org-wide — switcher shows "All labs" (default) + every active lab; lab-scoped roles see assigned labs only. First-run `/setup` + derived **"Getting started" checklist** (`lib/onboarding.ts`) on the admin job overview.
- **US-A4 roles/permissions**: fixed 4-role matrix in `lib/permissions.ts` (single source, UI + server), method clearances enforced at action time, read-only reference page — done (mock).
- **US-A5 labs**: CRUD + deactivate-with-reason (blocked while active work), rename remaps assignments — done (mock). **13 Jul decisions:** no seeded default "MAIN" lab (first-run setup instead); lab masterdata/status changes are audited in `lab.events[]` since 17 Jul.
- **US-A6 users**: list/create/edit with role, labs (not required for admins — 13 Jul), clearances (merge semantics preserve out-of-scope grants), deactivate-not-delete, unlock, per-user append-only event trail; email change re-keys and re-points batch claims — done (mock).
- **US-A7 settings**: security, identifier formats with live preview + strict token validation (`{LAB}` forbidden in job/sample formats, required in batch format — 13 Jul), sequence reset, jobLabel, sample types, result qualifiers, barcode, equipment window, per-lab toggles; all audited in `settingsEvents` — done (mock). Org-specific lists **start empty** at provisioning (13 Jul).

### Epic B — Masterdata (US-B1…B3) — done (mock)
- **US-B1 methods**: methods with versions, steps (required equipment types, input validation rule), analytes (unit, reporting decimals, LOQ), accreditation flag, worksheet templates (sha256, versioned), version-on-edit-when-used, deactivate with reason — done (mock). Method acts (create/edit/version/status/template) audited in `method.events[]` since 17 Jul.
- **US-B2 QC materials**: blank/control-standard/CRM with expected values ± tolerance (absolute/percent), lot + expiry (expired/soon flags), certificate upload, new-lot-as-new-record, active-only code uniqueness — done (mock). **Pass/fail judgement of QC results is epic E — not built** (review shows values vs frozen expectations, humans judge).
- **US-B3 equipment**: org-configurable type list (starts empty since 13 Jul; managed on the Equipment page), asset IDs never reissued, calibration due dates + certificates, routine checks (per-use/daily/weekly) with exact-decimal auto pass/fail, out-of-service/return, method/step links, **derived availability** (Available/Due soon/Blocked; no manual unblock — recovery only by resolving the cause), full equipment event history — done (mock). Blocked equipment gates step completion in epic D.

### Epic C — Jobs & samples (US-C1…C4) — done (mock)
- **US-C1 registration**: job intake (customer, received date/time via dd-mm-yyyy control, priority, deadline server-validated) + samples (type, deviation with §7.4.3 forced-consultation gate on mismatch, quantities as decimal strings, storage location, attachments) with immutable org-wide numbers; per-sample acceptance decisions; void job/sample with reason — done (mock). **Amended 13 Jul: jobs are organisation-wide** — no lab on the job; any active org method may be requested; the method's lab routes the work.
- **US-C2 overview** (post-login landing): derived job status (not-started/in-progress/completed/closed from batch membership), overdue flag (server-computed), filters (status/type/method/customer/date range), hidden-voided toggle — done (mock). Shows jobs with work in the active lab; "All labs"/support render org-wide.
- **US-C3 job detail/edit**: header + samples edit (IDs never change; removal only by void), add sample, per-job append-only History with before→after diffs, set-back-safe method removal guard against open batches — done (mock).
- **US-C4 labels**: Code 128 label printing (dependency-free SVG renderer `lib/barcode/code128.tsx`), org-configurable layout, blocked for read-only and voided jobs — done (mock).

### Epic D — Batches & results (US-D1…D6) — done (mock); D2's story text still "Ramazan's review pending"
- **US-D1 batch creation**: per lab+method, latest version pinned, eligible samples (accepted, non-voided, work routed to the lab — 13 Jul; explicit confirm to add a not-requested method), QC positions with quantities + **frozen expectation snapshots**, capacity counter, working-copy file generated (sha256, downloadable), composition editing until **one-way latch**, void with reason — done (mock).
- **US-D2 work queue**: prioritised batch list (deadline-derived, server-computed overdue), claim/release/assign, `assigneeCanAct` liveness badge for departed assignees — done (mock). Admin "All labs" view included (13 Jul).
- **US-D3 steps**: minimal state + append-only transition events; advance with structured equipment selection (Blocked not selectable), set-back with reason (never reopens composition), History = pure event projection; concurrency by expected-step compare — done (mock).
- **US-D4 result entry**: append-only measurement records (numeric/censored `<`/`>`/qualifier/text/no-result), corrections via supersede + mandatory reason (chain visible), origin provenance (manual/paste/worksheet/import), bulk paste and worksheet auto-read with staged **preview→confirm one-token contract** (post-preview drift refuses), ADR-4 strict numeric parsing — done (mock). **No reporting rounding** (see §3).
- **US-D5 instrument import**: per-lab import configs (CSV/Excel, wide/long, declared separators **and declared sheet name** — 17 Jul), RFC-4180 CSV parser + exceljs **string-typed cells only** (number/date/formula cells refuse, 17 Jul — no float path), preview with per-row/cell outcomes, ambiguous QC-code matches refuse (never last-wins), self-contained import event (source file + sha256 + frozen mapping + outcomes; stored even when nothing applies — 17 Jul) — done (mock). Configs listed under the masterdata scoping exemption. **Superseded direction:** upload import is the interim until the embedded worksheet (US-D7 draft) lands.
- **US-D6 review & completion**: review panel (results vs QC expectations, correction chains, §7.8.8 amendment flags), per-result validity (pending→valid/rejected, each flip an audit event, reviewer-must-differ per lab toggle), close-gap-no-result, batch completion latch, post-completion replacement guarded — done (mock). **Automated QC verdicts deliberately absent (epic E).**

### Out of scope (hooks only, not built)
Epic B4, **E** (QC auto-evaluation, nonconforming work, audit-trail read UI), **F** (reports/CoA, §7.8.8 amendments, rounding at reporting), **G** (dashboards). Hooks that exist for them: validity column, QC expectation snapshots, platform + per-entity event logs, `amendmentCheckRequired` flags, derived availability/status patterns.

## 6. Known gaps and technical debt

Security/enforcement (all "by design of the mock", all backend work):
1. **Unsigned session cookie** (base64url JSON, no HMAC) — forgeable; live-store re-validation is the only backstop. (TTL values in the payload clamp to the 5–480 min settings range since 17 Jul.)
2. **No persistence** — restart wipes everything (also the "reset" feature: `SEED_RESET` knob).
3. **No real auth**: demo password on all accounts, MFA `123456`, static reset token, reset doesn't change passwords (it does enforce the full password policy since 17 Jul).
4. **No reporting rounding** — `MethodAnalyte.decimals` documented but unused (epic E/F).
5. Support-session actions not yet mirrored into the customer's own audit log (US-A2 AC 9's "appear in your audit log" — epic E read-UI + write hook pending).
6. **No auth-event log** (US-A1 AC 9): logins/failures/lockouts are counted but not recorded as events.
7. Read UI for the new lab/method/QC/type audit trails deliberately deferred to epic E (equipment History is the only surfaced trail).

Quality/process:
8. ~~Zero automated tests~~ **Closed 17 Jul 2026**: Vitest invariant suite (`tests/invariants/` + `tests/triage/`, 70 tests across the two seed projects, `npm test`) covering append-only, attributability, never-delete, versioning, tenant isolation, authorization, the TTL/complexity wiring, and the 17 Jul triage guards. The review passes' scratch-harness checks (~121) remain uncommitted history.
9. ~~8 lint errors~~ **Closed 17 Jul 2026**: `npx eslint` reports 0 errors, 0 warnings; `npx tsc --noEmit` clean.
10. ~~16 open "Ramazan decisions"~~ **Closed 21 Jul 2026**: all 16 triaged 17 Jul (recommended option on every item) and built — commit-by-commit map in `docs/open-decisions.md`. Item 7 became a direction change: data entry moves from uploaded sheets to an **embedded in-app worksheet** (proposed US-D7, `docs/story-draft-embedded-worksheet.md`); the hardened upload import is the interim.
11. Supabase scaffold drift: `lib/auth/supabase.ts` maps only `admin`/`user` DB roles vs the app's five-role matrix (unknown → read-only degradation); migrations predate all 13 Jul model changes (org-wide jobs etc.) and would need rework.
12. `.env.local` is committed by team decision (5 Jul) — currently harmless (mock secrets only), but worth revisiting before real credentials exist.

## 7. Decision log — key decisions

Full log: `docs/decision-log.md` (57 dated entries, one line each — the non-negotiable discipline; feeds the validation package). The ones that shape everything:

| Date | Decision |
|---|---|
| 3 Jul | **Mock-first**: build the full frontend against an in-memory mock behind swap-point interfaces until the backend spec lands. |
| 3 Jul | Auth provider research → **Supabase Auth (Pro), server-proxy pattern** chosen (currently parked/inactive). |
| 3 Jul | **Org routing session-bound** — no org in URLs. |
| 3 Jul | **Derived, never stored**: sample lifecycle status computed from batch membership; same pattern later for equipment availability, batch phase, job status, assignee liveness, onboarding checklist. |
| 3–4 Jul | **Minimal state + append-only events** for batch workflow; **append-only measurement rows + one validity column** for results (ADR-2); **decimal strings + BigInt comparisons, floats never** (ADR-4); locale ambiguity rejected, never guessed. |
| 4 Jul | Own strict CSV parser + exceljs raw text; **import event = self-contained snapshot** (file + sha256 + frozen mapping + outcomes). |
| 10 Jul | QC expectation **snapshots** frozen into batches; various pass-3 hardening. |
| 13 Jul | **Platform-level audit log** introduced (provisioning + org status changes, attributed). |
| 13 Jul | **Provisioning seeds NO default lab** (reverses 1 Jul "MAIN" seeding) → first-run `/setup`; **provisioning creates the first admin account**; `LIMS_CLEAN_SEED` clean-start mode. |
| 13 Jul | **Jobs are organisation-wide; batches stay lab-scoped** — one order = one number (`J{YY}-{SEQ:00000}`, org+period sequence); methods route work to their lab; `{LAB}` forbidden in job/sample formats, required in batch format. |
| 13 Jul | **Admins are org-wide** — no lab assignments; "All labs" switcher default. Supersedes the same-day creator-auto-assign decision. |
| 13 Jul | **Org-specific lists start EMPTY** at provisioning (sample types, result qualifiers, equipment types); demo org seeds its own as data. |
| 13 Jul | **dd-mm-yyyy strict masked date entry** (ISO on the wire); derived **Getting-started checklist** (no stored onboarding state); job deadlines server-validated. |
| 17 Jul | **All 16 parked decisions triaged** (recommended option on each; one consolidated log entry) and subsequently built. **Data entry to move to an embedded in-app worksheet** (proposed US-D7) — uploaded-sheet import becomes the interim, hardened to string-typed cells + declared sheet names. |

## 8. Doc drift — docs vs. actual code

The root cause: `docs/stories/` and `docs/00-INDEX.md` are **frozen Notion exports of 1–2 Jul**; the 13 Jul decisions exist as implemented code + drafted-but-unapplied amendments (`docs/notion-amendments-2026-07-13.md`). Until the Notion master is amended and re-exported, the following story text is **wrong about the code**:

| Doc location | Stale claim (as written) | Reality (as built) | Amendment drafted? |
|---|---|---|---|
| `docs/build-report.md` (4 Jul) | "Not started at all: US-B1…US-D6 (15 of 20 stories)"; no audit log; provisioning creates no admin account | **All 20 stories built** and reviewed (passes 2–4, 6–13 Jul); platform audit log exists; provisioning creates the first admin | ✅ replaced with a supersession pointer to this file (17 Jul) |
| `docs/00-INDEX.md` (2 Jul) | "all 20 stories frozen" statuses | Predates every 13 Jul amendment | n/a — regenerate on re-export |
| US-A3 AC 4 + authorization note | switcher offers only **assigned** labs; single-lab users see name only | Admins: "All labs" default + every active lab | ✅ Decision B |
| US-A4 AC 7 | "each user is assigned to one or more labs" | Lab-scoped roles only; **Admin is org-scoped** | ✅ (clarification) |
| US-A5 AC 8 (+ its changelog "✅ seeding confirmed") | default lab "Main"/"MAIN" seeded at provisioning | **No default lab**; first-run `/setup`; the changelog's *rejected* option is what's now built | ✅ (in decision log; setup covered under Decision A/B texts) |
| US-A5 AC 6, AC 3 | jobs linked to a lab; job identifiers embed the lab code | Jobs org-wide; only **batch** numbers carry the lab code | ✅ Decision A |
| US-A6 AC 2 | new user requires ≥1 lab assignment | Not required for Admin role | ✅ Decision B |
| US-A7 AC 3 | job sequences per org **and per lab**; default `{LAB}{YY}-…` → "MAIN26-00001" | Job sequences per org+period; default `J{YY}-{SEQ:00000}`; `{LAB}` rejected in job/sample formats, **required** in batch format | ✅ Decision A |
| US-A7 AC 9c / US-D4 AC 3 | qualifier list "default contains 'n.b.'" | All org-specific lists start **empty** at provisioning | ✅ Decision F (drafted 17 Jul) |
| US-B3 AC 2 | configurable type list "e.g. Balance, ICP-OES, pH meter" starter | Type list starts empty | ✅ Decision C |
| US-C1 scope note, AC 1/2/3/14 + UI sketch | job belongs to exactly one lab; per-lab sequences; methods of the job's lab; Lab dropdown in the form | Org-wide jobs; org sequence; any active org method (labelled with its lab); no Lab field | ✅ Decision A |
| **US-C3 AC 4** | "the lab is fixed at creation — the job number embeds the lab code and sequences run per lab" | Every clause obsolete (org-wide jobs) | ✅ Decision D (drafted 17 Jul) |
| US-C2 AC 1 | overview "scoped to the active lab" | Jobs with work in the active lab; org-wide for admins/support | ✅ Decision A |
| US-D1 AC 3 | eligible sample "belongs to the same lab as the batch" | Eligible = work routes to the batch's lab, from any job | ✅ Decision A |
| **US-D2 AC 1** (story itself still "Ramazan's review pending") | "lists all batches of the active lab" | Admin "All labs" org-wide batch view exists | ✅ Decision E (drafted 17 Jul; D2's review is still open) |
| CLAUDE.md "Stack context" | "Azure stack… advice: Entra ID External ID… Azure SQL/PostgreSQL… Azure Blob" | Actual direction: Next.js + Supabase (chosen 3 Jul, currently parked); no Azure anywhere in the code | ✅ rewritten 17 Jul (as-built stack, Supabase parked, batch-only lab code stated) |
| "the lab CODE is stamped into every job and batch identifier" wording | appears in older code comments and story text | Batch identifiers only | ✅ verified 17 Jul: CLAUDE.md itself never claimed it; the batch-only fact is now explicit in its Stack context. Story text falls under Decisions A/D |
| `docs/review-progress.md` working agreement | "Git is Ramazan's. Never run git write commands." | Since 13 Jul, Ramazan explicitly has Claude commit (co-authored commits `9ef885a`…`cfde982`) | ✅ agreement updated 17 Jul (Claude commits on request, co-authored) |
| `docs/research/us-a1-auth-provider-options.md` + Supabase migrations | Supabase Auth chosen and schema written | Adapter inactive (env commented out); migrations predate org-wide jobs and the five-role matrix mapping is incomplete | note as "parked" |

**For the story-writing session:** the drafted amendment texts in `docs/notion-amendments-2026-07-13.md` are ready to paste into Notion — Decisions A–G plus changelog lines (D/E/F close the coverage gaps this audit found; G carries the 17 Jul triage amendments: US-B3 AC 2 optional fields, US-D4 AC 6 locale display dropped, rejected-cell completion reading). The 16 design decisions are **decided and built** (`docs/open-decisions.md` has the commit map); the proposed **US-D7 embedded-worksheet story** (`docs/story-draft-embedded-worksheet.md`) is ready to refine and freeze in Notion. New stories for epics E/F/G can build on the hooks listed at the end of §5.

---

*Everything above was verified against the code at commit `cfde982` (three independent code/doc audits, 17 Jul 2026). §5–§8 updated 21 Jul 2026 after the triage build (commits `52a9734`…`4039b78`; suite 70/70 on both seeds, tsc + eslint clean). Items that could not be verified in the repo are marked "unverified". Nothing in this file describes intended-but-unbuilt behaviour without saying so.*

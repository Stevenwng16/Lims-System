# Build report — LIMS frontend (as of 4 Jul 2026)

Written for external review against `docs/stories/`, `CLAUDE.md` and `docs/architecture-kaders.md`.

**Read this first — the one fact that frames everything below:** what exists today is a
**frontend prototype against an in-memory mock**, by explicit decision (decision log,
3 Jul 2026: "mock API layer until the partner-built backend's spec is known"). There is **no
database, no real auth provider, no audit log, and no automated test** in this repository.
Where an AC below says "done", read it as **"done at mock level"**: the UI flow and the rule
logic exist and behave per the AC against `lib/mock-db.ts`, but nothing is persistent,
server-hardened or audited. Rules enforced in mock server actions disappear on process
restart and can be bypassed by forging the unsigned session cookie (see §3).

---

## 1. Story status

Phase-1 stories US-A1…US-A7 are the only stories touched. **Not started at all:
US-B1, US-B2, US-B3, US-C1, US-C2, US-C3, US-C4, US-D1, US-D2, US-D3, US-D4, US-D5, US-D6**
(15 of 20 stories).

### US-A1 — Authentication & session

- AC 1 (unique personal account per email) — **partial**: mock user store is keyed by unique email (platform-wide, via US-A6 create); no real credential store exists.
- AC 2 (email+password login → session → landing page) — **partial**: full flow works against the mock; session is an unsigned base64url cookie; lands on the US-A3 phase-1 home.
- AC 3 (generic failure message + failed attempt recorded) — **partial**: generic message implemented ("Invalid email or password"); the attempt is only counted in memory — nothing is *recorded* (no audit log exists).
- AC 4 (org-configurable password policy, enforced at creation and every change) — **partial**: min length + complexity flag are configurable in Settings; only min length is enforced, and only in the mock reset flow. Complexity is stored but enforced nowhere. Account creation (US-A6 invite) involves no password at all in the mock.
- AC 5 (TOTP MFA, enable/require per organisation) — **partial**: MFA step exists in the login flow; org-wide "require MFA" toggle works and takes effect immediately; but the "TOTP" is a hardcoded demo code (123456) — no secret enrolment, no authenticator app, no per-user self-service enrolment UI.
- AC 6 (reset via time-limited link; invalidates old password; ends all sessions) — **partial**: UI flow complete; but the token is a static demo string with no expiry and no email delivery, a "successful" reset does not actually change any password (it only clears lockouts), and no sessions are terminated.
- AC 7 (configurable lockout, default 5; restore via reset or admin unlock) — **done (mock)**: counter, org-configurable threshold (Settings), restore via reset flow and via admin unlock (US-A6 edit dialog) all work in-memory.
- AC 8 (configurable inactivity timeout, default 30; logout button) — **partial**: 30-minute sliding cookie expiry and logout button work, **but the timeout is hardcoded** (`SESSION_TTL_MS` in `lib/auth/session.ts`); the org setting `sessionTimeoutMinutes` (US-A7) is stored and validated but **not wired** to the actual cookie TTL. Known, unlogged debt.
- AC 9 (every auth event to append-only audit log) — **not started**: no audit log of any kind exists.
- AC 10 (unauthenticated users reach only login/reset pages) — **done (mock)**: enforced in `proxy.ts` for all routes; verified via HTTP smoke checks. Caveat: cookie is forgeable, so this is flow-control, not security.
- AC 11 (seeded org-admin at provisioning) — **not started**: provisioning (US-A2 mock) creates the organisation, settings and default lab and logs an "invitation", but **does not create any admin user record** — a freshly provisioned org has no loginable account.
- AC 12 (SSO-ready design constraint) — **not started**: a backend data-model constraint; nothing in the mock addresses or violates it.
- AC 13 (session bound to organisation) — **partial**: the session cookie carries the organisation and all mock APIs filter by it; binding is by convention, not enforcement.

### US-A2 — Organisations & platform administration

- AC 1 (org entity: id, name, status, created; never deleted; deactivation with reason) — **partial**: entity + fields exist; suspend/reactivate with mandatory reason implemented; the third status "deactivated" exists in the type but **has no UI flow**.
- AC 2 (tenant boundary, mechanism per ADR-1) — **not started**: no backend. Mock APIs filter by `orgId`, which is convention, not a boundary.
- AC 3 (platform level, personal platform accounts, separate platform audit log) — **partial**: platform-admin role, account and vendor-only console exist; no platform audit log.
- AC 4 (provision org: name + first-admin email → seeded admin + invitation) — **partial**: provisioning form and org creation work; the invitation is a dev-console log line and **no seeded admin account is created** (same gap as US-A1 AC 11).
- AC 5 (provisioning seeds settings defaults) — **done (mock)**: `defaultOrgSettings()` + a seeded "Main lab"/MAIN (US-A5 AC 8).
- AC 6 (suspend: users can't log in, neutral message; reactivation restores; reasons recorded) — **done (mock)**: verified manually incl. the neutral login message; "recorded" only as a field on the org (statusReason), not as an audit entry.
- AC 7 (subscription status visible to platform admins) — **done (mock)**: shown in the console; not editable (the AC only requires visibility).
- AC 8 (support access: consent-first, time-scoped, revocable) — **done (mock)**: grant with 24 h/72 h/7 d duration + optional admin rights; instant revoke; expiry honoured.
- AC 9 (support session: attributable, audited in the org's log, marked in UI) — **partial**: opening requires an active grant; persistent banner with read-only/admin mode; capability mapping per US-A4 AC 13. Attribution and audit recording do not exist.
- AC 10 (no domain-data browsing without a grant) — **partial**: `proxy.ts` keeps platform admins out of customer routes unless a support session is active; mock-level only.
- AC 11 (all audit entries carry org context; org-only visibility) — **not started**.
- AC 12 (minimal platform console) — **done (mock)**: list, provisioning form, suspend/reactivate, support-grant status.

### US-A3 — Navigation shell & landing page

- AC 1 (one consistent shell; org/lab context, user, logout always visible; no shell unauthenticated) — **done (mock)**.
- AC 2 (target nav structure; items appear only once their feature exists) — **done**: sidebar config grows per story; currently Home + Admin (Roles, Users, Labs, Settings).
- AC 3 (role-aware menu visibility) — **done (mock)**: driven by the US-A4 matrix; per the story, final verification belonged with US-A4 — UI side verified manually, server side is mock-grade only.
- AC 4 (active lab always visible; switcher for multi-lab users; name only for single-lab) — **done (mock)**: cookie-based active-lab context; switcher validates the lab server-side against the user's assignments.
- AC 5 (landing page: minimal home in phase 1) — **done**: welcome, org, active lab, role, links. Note: the home page also shows a **placeholder dashboard with fabricated jobs/stats**, labelled "placeholder — mock data"; this is user-requested filler, not part of any story.
- AC 6 (system-message area; support banner in it; invisible when empty) — **done (mock)**.
- AC 7 (active item highlighted; page titles; breadcrumbs on nested pages) — **done**: breadcrumbs on all Admin/Settings pages; deeper hierarchies (job → sample) don't exist yet.
- AC 8 (collapsible sidebar, preference remembered per user) — **partial**: collapse + icon mode + persistence work, but the preference is a **browser cookie, not per user account** — two users sharing a terminal share the preference.
- AC 9 (desktop + tablet; collapses to toggleable menu) — **done (mock)**: shadcn sidebar switches to a drawer on narrow widths; checked by resizing, no formal tablet-device verification.
- AC 10 (navigation preserves session and lab context) — **done (mock)**.

### US-A4 — Roles & permissions

- AC 1 (four fixed roles, exactly one per user) — **done (mock)**.
- AC 2 (capability matrix as single source of truth, enforced server-side on every action) — **partial**: the matrix exists once, in `lib/permissions.ts`, and both the sidebar and the reference page render from it. Server-side enforcement exists only inside the mock server actions of the admin screens; there is no generic enforcement layer and no real backend.
- AC 3 (role capabilities summary) — **done**: encoded 1:1 with the story table, incl. the two conditional cells.
- AC 4 (job creation restricted to Admin/Lab manager) — **not started**: jobs don't exist; the restriction is encoded in the matrix, unenforceable until US-C1.
- AC 5 (batch creation restricted; per-lab analyst toggle) — **partial**: the per-lab toggle exists and is editable (US-A7); batches don't exist, so nothing enforces it yet.
- AC 6 (method clearance enforcement with clear block message) — **partial**: clearances are stored and editable per user (US-A6); no enforcement point exists yet (no data entry until US-D4).
- AC 7 (lab scope as inner boundary) — **partial**: active-lab context exists; the users list is lab-scoped for lab managers; no domain data exists to scope.
- AC 8 (no action via direct URL/API beyond role) — **partial**: all admin pages and server actions re-check the role server-side (mock); undermined by the forgeable session cookie — real enforcement is a backend obligation.
- AC 9 (no self-escalation) — **done (mock)**: self-edit of role/labs/clearances is rejected server-side.
- AC 10 (last-admin protection) — **done (mock)**: demotion and deactivation of the last active admin are blocked.
- AC 11 (role/clearance/lab changes audited) — **not started**.
- AC 12 (UI shows only permitted items; hidden also blocked server-side) — **done (mock)** with the same cookie caveat as AC 8.
- AC 13 (support sessions map through the same matrix) — **done (mock)**: `effectiveOrgRole()` maps read-only grant → Read-only, admin grant → Admin. One conscious exception, documented in code but **not in the Notion master**: managing the support grant itself stays with the customer's real Admin even during an admin-rights support session (see §4).

### US-A5 — Lab management

- AC 1 (list with name, code, status, user/method/equipment counts) — **partial**: list works; user counts are computed from real mock assignments, but **method and equipment counts are fabricated seed numbers** (those entities don't exist until US-B1/B3).
- AC 2 (create with org-unique code) — **done (mock)**: uniqueness enforced case-insensitively within the organisation only.
- AC 3 (edit; code change never rewrites issued IDs) — **done (mock)** trivially: no IDs have ever been issued; nothing rewrites anything.
- AC 4 (deactivate never delete; no new assignments to inactive labs) — **partial**: deactivate/reactivate work, no delete exists; "no new assignments" is honoured by the two consumers that exist (user create/edit and lab-settings only offer active labs); future consumers (methods, jobs…) don't exist yet.
- AC 5 (block deactivation while active work exists) — **done (mock)**: driven by a seeded `hasActiveWork` flag — real jobs/batches don't exist, so the flag is an assumption, not derived state.
- AC 6 (lab as scoping boundary everywhere) — **partial**: same status as US-A4 AC 7.
- AC 7 (last active lab cannot be deactivated) — **done (mock)**.
- AC 8 (provisioning seeds "Main lab"/MAIN) — **done (mock)**.
- AC 9 (all lab actions audited) — **not started**.

### US-A6 — User management

- AC 1 (list: name, email, role, labs, status, last login; lab managers see own labs only) — **done (mock)**.
- AC 2 (create with name, unique email, role, labs, initial clearances) — **done (mock)**.
- AC 3 (email invitation; admin never sets or sees a password) — **partial**: no password field exists anywhere in the UI (per the AC), but the "invitation" is a dev-console log and the mock **presets the shared demo password** so the account is usable — a deliberate, visible shortcut.
- AC 4 (edits take effect immediately; revoked clearance blocks work straight away) — **partial**: edits are immediate; "blocks further work" is unverifiable — no work exists yet.
- AC 5 (clearances managed per user, grant/revoke immediate) — **done (mock)**: checkbox list from a mock method catalog (`MOCK_METHODS` — methods aren't real until US-B1).
- AC 6 (deactivate never delete; blocked login; reactivate) — **done (mock)**: deactivated users get the generic login failure.
- AC 7 (admin-triggered reset and unlock) — **done (mock)**: reset is a console.log; unlock genuinely clears the lockout.
- AC 8 (last-admin protection) — **done (mock)** (same rule as US-A4 AC 10).
- AC 9 (no self-editing of role/clearances/labs; own profile elsewhere) — **partial**: self-edit is blocked server-side; the "own profile" page for name/password/MFA **does not exist yet**.
- AC 10 (lab managers: Analyst/Read-only only, own labs only) — **done (mock)**: enforced in the mock API (role options, lab subset, no touching admins/lab managers).
- AC 11 (email unique platform-wide, across organisations) — **done (mock)**: checked against all users in the store, not just the org.
- AC 12 (all user-management actions audited) — **not started**.
- AC 13 (identity vs organisation membership modelled separately) — **not started**: the mock record is deliberately flat; the constraint is flagged in a code comment in `lib/mock-db.ts` as a backend data-model obligation. **The reviewer should treat this as unaddressed.**

### US-A7 — Settings

- AC 1 (three sections; safe defaults seeded at provisioning) — **done (mock)**.
- AC 2 (security settings enforced via US-A1) — **partial**: lockout threshold and org-wide MFA requirement are genuinely enforced by the mock login; min password length only in the reset flow; complexity stored but never enforced; **session timeout stored but not wired** (see US-A1 AC 8).
- AC 3 (identifier templates, tokens, live preview, sequence reset, per-org+per-lab sequences) — **partial**: templates, tokens, live preview and the reset option are done (`lib/settings/format-id.ts` is the single renderer). **Sequences themselves don't exist** — no ID has ever been generated; per-org/per-lab counter isolation is unimplemented and untested.
- AC 4 (format changes affect new IDs only) — **not testable yet**: no IDs are issued anywhere; nothing violates it.
- AC 5 (configurable label for "job", shown throughout the UI) — **partial**: stored and editable; **no UI currently consumes it** (the only place "jobs" appear is the placeholder dashboard, which hardcodes the word).
- AC 6 (per-lab toggles: analyst batch creation, reviewer-must-differ) — **done (mock)** as storage + UI; enforcement belongs to epics C/D which don't exist.
- AC 7 (validation: reject template without {SEQ}; numeric min/max) — **done (mock)**: verified manually for both cases.
- AC 8 (every settings change audited with old + new value) — **not started**.
- AC 9 (sample-type list, barcode config, result-qualifier list) — **done (mock)**: all three; list entries rename/deactivate only (no delete path exists); human-readable sample ID is rendered as a disabled, always-on checkbox.

---

## 2. Data model as built

**There is no database.** No schema, no migrations, no tables. The two decision-log entries
choosing Supabase (Auth + Postgres) were made on 3 Jul 2026, but before any schema work
started the project pivoted (dev partner reported an existing backend, stack still unknown)
and all further work went into the frontend against a mock. Artifacts of the Supabase
decision still in the repo but **unused by any code**: `@supabase/supabase-js` and
`@supabase/ssr` in `package.json`, the `supabase` CLI as a dev dependency, and a scaffolded
`supabase/config.toml` with no migrations.

What exists instead is one in-memory store, `lib/mock-db.ts` — four `Map`s on `globalThis`,
reseeded on every dev-server restart:

| Store | Key | Fields | Purpose |
|---|---|---|---|
| `organisations` | org id | id, name, status (active/suspended/deactivated), statusReason?, subscription, createdAt, userCount, setupPending, supportGrant (grantedAt, expiresAt, allowAdmin, sessionActive) \| null | Tenant records for the vendor console (US-A2) |
| `users` | email | email, name, organisation (name), role, orgId (nullable), labs (names[]), clearances[], status, lastLogin, password (plaintext!), mfaRequired, failedAttempts, locked | Accounts for mock auth + US-A6 |
| `labs` | lab id | id, orgId, name, code, description, status, methodCount, equipmentCount, hasActiveWork, analystsMayCreateBatches, reviewerMustDiffer | US-A5 + per-lab settings (US-A7 AC 6) |
| `orgSettings` | org id | security{minPasswordLength, requireComplexity, lockoutThreshold, sessionTimeoutMinutes, requireMfa}, identifiers{jobFormat, sampleFormat, batchFormat, sequenceReset}, jobLabel, sampleTypes[], resultQualifiers[], barcode{…} | US-A7 |

Plus three cookies acting as state: `lims_session` (unsigned base64url JSON: user + expiry),
`lims_support` (support-session marker), `lims_lab` (active lab, by name).

The three explicit confirmations requested:

- **`organisation_id` on every table** — ❌ **cannot be confirmed; no tables exist.** In the mock: labs and orgSettings carry/are keyed by orgId; users have a *nullable* orgId (null for vendor staff — the real model must resolve this, e.g. platform accounts outside the tenant schema); the session/support/lab cookies carry org context by name or id. Invariant 5 is currently upheld by convention in mock code, not by any mechanism.
- **Audit log append-only** — ❌ **there is no audit log at all.** Not append-only, not anything. Every AC that requires audit writes (A1 AC 9, A2 AC 3/9/11, A4 AC 11, A5 AC 9, A6 AC 12, A7 AC 8) is unmet. This is the single largest gap versus the invariants in CLAUDE.md.
- **Identity vs membership separated (US-A6 AC 13)** — ❌ **not separated.** `MockUser` is flat; a code comment marks the split as a backend obligation. If the real backend copies the mock shape, it will violate AC 13.

Other model-level notes: users reference labs **by name**, so renaming a lab silently
orphans assignments (mock-only bug, acceptable there, must not be copied); passwords are
stored in plaintext in the mock (never acceptable outside it); `methodCount`/
`equipmentCount`/`hasActiveWork` on labs are fabricated placeholders.

## 3. Auth implementation summary

**Supabase is not wired at all — there is no Supabase proxy boundary to assess.** No code
imports the Supabase SDK; no Supabase project was ever created (the pivot happened first).
Consequently: no direct client→Supabase path exists, but only because *no* Supabase path
exists. The "server-proxy pattern" in the decision log (3 Jul 2026, Supabase Auth entry,
with its accepted trade-offs: lockout/MFA enforcement as our code to test and defend,
SAML-only enterprise SSO) describes a **planned architecture, not an implemented one** —
and per the later mock-API entry it stands only "until the partner's stack is confirmed".

What is actually implemented:

- **Flow shape mirrors the proxy pattern**: the browser never talks to any auth service; login/MFA/reset are Next.js **server actions** (`app/(auth)/actions.ts`) calling an `AuthApi` interface (`lib/auth/types.ts`), implemented today by `lib/auth/mock.ts`. The real backend replaces one binding in `lib/auth/index.ts`. The same interface/mock/index pattern repeats for platform, labs, users and settings modules.
- **Session**: unsigned base64url JSON cookie (`lib/auth/session.ts`), httpOnly, 30-min sliding renewal in `proxy.ts`. **Anyone can forge any role by crafting this cookie** — it is explicitly mock-grade (comment in code says "NOT tamper-proof — replaced wholesale when the real backend lands"). All "server-side" role checks in server actions trust it.
- **Route gating**: `proxy.ts` (Next 16 middleware) — unauthenticated → login/reset only; non-platform roles blocked from `/platform`; platform admins confined to `/platform` unless a support session is active.
- **Lockout**: `lib/auth/mock.ts` `login()` — counts failures, locks at the org's `lockoutThreshold` (read live from `orgSettings`, so the US-A7 toggle demonstrably works). Unlock: US-A6 action or the reset flow.
- **Per-org password policy**: minimum length read from `orgSettings` and enforced **only** in the mock `resetPassword()`; the reset page's helper text hardcodes "at least 12 characters" and goes stale if the setting changes. Complexity: stored, never enforced.
- **Per-org MFA**: `login()` requires the MFA step when `user.mfaRequired || orgSettings.security.requireMfa` — org toggle takes effect at next login. The factor itself is a hardcoded demo code, not TOTP.
- **Tested**: none of this has automated tests; verified by manual flows and scripted HTTP smoke checks (status/redirect assertions) during development only.

## 4. Decisions & deviations

All `docs/decision-log.md` entries to date (all 3 Jul 2026):

1. **Auth provider: Supabase Auth (Pro), server-proxy pattern** — chosen over Auth0/Entra/Clerk after a sourced comparison (`docs/research/us-a1-auth-provider-options.md`). Accepted consequences recorded in the entry. **Status: not implemented; standing but in doubt pending the partner-backend stack.**
2. **App database: Supabase Postgres (EU) for everything; shared DB + organisation_id + RLS** (ADR-1). **Status: not implemented; same doubt as above.**
3. **Frontend against a mock API layer** until the partner backend's spec is known; explicitly notes the two Supabase entries stand until then. **Status: implemented — it is everything in this report.**
4. **UI foundation: shadcn/ui on Tailwind v4, components vendored** (also names react-hook-form + zod — see deviations). **Status: implemented.**
5. **Rendering model: server-rendered Next.js App Router with client islands** (US-A3 decision block). **Status: implemented.**
6. **Org routing: session-bound, no organisation in the URL** (ADR-1 open question 2 / US-A2 decision block; Ramazan's choice). **Status: implemented.**

Conscious deviations and known debt **not** in the decision log or Notion changelog:

- **Support-grant management during support sessions**: US-A4 AC 13 says admin-grant sessions get Admin capabilities with "no separate permission path", but the support-access page/actions require the customer's *real* Admin — a vendor in an admin-rights session cannot extend or re-grant their own access. Deliberate (defensible via US-A2 AC 8 "an organisation Admin can grant"), documented only in a code comment. Should be ratified or reversed in the Notion master.
- **"Users" menu visible to lab managers** although the US-A4 matrix row "Manage users" is Admin-only — reconciles the matrix with US-A6's explicit lab-manager scope; documented in a code comment (`components/app-sidebar.tsx`), not in Notion.
- **Session timeout setting unwired** (US-A1 AC 8 / US-A7 AC 2) — stored, validated, ignored by the actual session cookie.
- **Provisioning creates no seeded admin** (US-A1 AC 11 / US-A2 AC 4) — a provisioned org is not loginable.
- **Job label not consumed anywhere** (US-A7 AC 5).
- **react-hook-form + zod named in the decision log but never adopted** — all forms are plain `useActionState` + FormData. Either amend the entry or adopt them.
- **Sidebar collapse preference is per browser, not per user** (US-A3 AC 8).
- **Own-profile page (name/password/MFA self-service) does not exist** (referenced by US-A6 AC 9).
- **Org status "deactivated" has no flow** (US-A2 AC 1) — only suspend/reactivate.
- **Dev-only demo-accounts panel** on the login screen (`app/(auth)/login/demo-accounts.tsx`) — gated to non-production builds; must be deleted with the mock.
- **Placeholder dashboard** with fabricated stats/jobs on the home page — labelled as mock; predates the stories; to be replaced by US-C2/epic G.
- **Users→labs linkage by name** (renaming a lab breaks assignments in the mock).
- **i18n (EN/NL) deliberately deferred** by Ramazan (4 Jul 2026 discussion) — to be added to the Notion backlog as a Later item; not yet logged anywhere else.

## 5. Tests & stack

**Automated tests: none.** There is no test runner, no test configuration and no test file
in the repository. Every DoD item across US-A1…A7 that says "verified by test" is
**unmet** — the full list: tenant-binding test, session timeout + lockout tests (A1);
isolation test, support-flow end-to-end test, provisioning test (A2); tablet/keyboard/
collapse-persistence checks (A3); per-role enforcement incl. direct-URL attempts,
last-admin, clearance block, batch-toggle, support-mapping tests (A4); deactivate/block/
last-lab/unique-code/seeded-lab tests (A5); invite-flow, deactivate-not-delete, last-admin,
lab-scope, email-uniqueness tests (A6); identifier preview/validation, format-stability,
sequence-isolation, toggle-effect tests (A7). All verification so far was manual flows plus
scripted HTTP smoke checks (redirect/status assertions against the dev server) that live
only in the session history, not in the repo. Audit-log DoD items are unmet for the deeper
reason that no audit log exists.

**Stack as built:**

- Next.js 16.2.10 (App Router, Turbopack), React 19, TypeScript 5, Tailwind CSS v4.
- shadcn/ui (Base UI primitives, base-nova preset) vendored under `components/ui/`; lucide-react icons; next-themes (class strategy) for user-switchable dark mode; Inter (UI) + Geist Mono fonts; violet primary token set in `app/globals.css`.
- No backend connection of any kind. The partner backend's stack remains unknown; every domain module has a single swap point for it.

**Folder layout (the parts that matter):**

```
app/
  (auth)/        login (+ demo panel), forgot/reset password, server actions
  (app)/         authenticated shell (layout.tsx = US-A3 shell)
    page.tsx     phase-1 home + placeholder dashboard
    admin/       roles/ (US-A4 matrix), users/ (US-A6), labs/ (US-A5)
    settings/    US-A7 hub + support-access/ (US-A2 customer side)
  platform/      vendor console (US-A2), outside the customer shell
proxy.ts         route gating (Next 16 middleware convention)
lib/
  auth/ platform/ labs/ users/ settings/
                 each: types.ts (interface) + mock.ts + index.ts (swap point)
  mock-db.ts     the in-memory store (see §2)
  permissions.ts US-A4 capability matrix (single source of truth)
  lab.ts         active-lab cookie helper
components/      app-sidebar, lab-switcher, support-banner, theme-*, ui/
docs/            stories, ADR summary, decision log, research notes, this report
supabase/        scaffolded config, unused (see §2)
```

**How the halves connect:** they don't yet. The frontend calls interfaces; the mocks answer.
The integration contract offered to the backend is the five `lib/*/types.ts` interfaces plus
the enforcement rules duplicated in the mocks — the real backend must own every one of those
rules (the mock's enforcement is demonstrative, not protective).

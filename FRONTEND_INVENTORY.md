# Frontend inventory — LIMS application

A snapshot of the frontend **as implemented** on 21 July 2026 (branch `Ramazan`). Written for an external reviewer preparing a frontend test plan without codebase access: this document is the single source of truth for what exists. It describes what IS, not what should be — gap analysis against requirements is deliberately out of scope. Where older documentation in the repo contradicts the code, the code wins (section 11 lists those cases).

Conventions used throughout:
- All file paths are relative to the project root.
- `[UNVERIFIED]` marks statements that could not be confirmed from the code; `[PARTIAL]` marks half-built features, with the extent described.
- Double-quoted strings are exact user-facing texts, validation rules or enum values quoted from the code.
- "Server" means Next.js server components/actions — the in-memory mock backend behind them (section 8) enforces all rules; there is no separate service.

## 1. Application overview

**Stack (exact versions from `package.json`):**
- `next` 16.2.10 (App Router), `react` / `react-dom` 19.2.4, `typescript` ^5
- UI: `@base-ui/react` ^1.6.0 (headless primitives), `shadcn` ^4.13.0 (vendored component style), `tailwindcss` ^4 (+ `@tailwindcss/postcss`, `tw-animate-css` ^1.4.0), `lucide-react` ^1.23.0 (icons), `next-themes` ^0.4.6 (dark/light), `class-variance-authority`, `clsx`, `tailwind-merge`
- Domain: `exceljs` ^4.4.0 (the only runtime file-parsing dependency — Excel read for imports)
- Auth (parked): `@supabase/ssr` ^0.12.0, `@supabase/supabase-js` ^2.110.0, `supabase` CLI ^2.109.0 (dev)
- Test: `vitest` ^4.1.10; Lint: `eslint` ^9 + `eslint-config-next`
- NOTE: `react-hook-form` and `zod` are **NOT** in package.json despite the 3 Jul decision-log line naming them — all forms are hand-rolled with `useActionState` + server actions. [Deviation: code is current.]

**Scripts** (`package.json`): `npm run dev` (next dev), `npm run build`, `npm start`, `npm run lint` (eslint), `npm test` (vitest run — the whole suite runs twice, once per seed mode via `vitest.config.ts` projects `demo-seed` and `clean-seed`), `npm run test:watch`.

**How to run locally:** `npm install`, `npm run dev`, open http://localhost:3000. No external services needed — the auth/backend switch (`lib/auth/index.ts`) selects the in-memory mock whenever `NEXT_PUBLIC_SUPABASE_URL` is unset. In the committed `.env.local` the two Supabase vars are **commented out** and `LIMS_CLEAN_SEED=1` is **set**, so a fresh clone currently runs the MOCK backend with the CLEAN seed (empty platform, only `vendor@lims.dev`). Remove/comment `LIMS_CLEAN_SEED` and restart to get the demo dataset. `NEXT_PUBLIC_SITE_URL=http://localhost:3000` is used for password-reset redirect links. `.env.local` is committed by team decision (5 Jul 2026, README). `next.config.ts` is empty (no custom config). README.md is the create-next-app boilerplate plus a "Auth backend (Supabase vs mock)" section; its claim "**With `.env.local`** → the real Supabase backend" is stale — the file exists but its Supabase vars are commented out, so the mock runs. [Deviation: code is current.]

**Env knobs (all read at module load; restart the dev server after changing):**
- `LIMS_CLEAN_SEED=1` → clean seed (`lib/mock-db.ts` `cleanDb()`); unset/`0` → demo seed (`seedDb()`).
- `NEXT_PUBLIC_SUPABASE_URL` (+ `NEXT_PUBLIC_SUPABASE_ANON_KEY`) → activates the Supabase auth adapter (see section 8).
- `SEED_RESET` is **not** an env var: it is a constant in `lib/mock-db.ts` (line ~1996, currently `1`). Editing the number invalidates the globalThis cache key and reseeds on next page load without a dev-server restart.

**Folder structure:**
- `app/` — App Router routes: `(auth)/` login, forgot-password, reset-password; `(app)/` the authenticated shell (jobs, batches, methods, quality/equipment, quality/qc-materials, admin/labs, admin/users, admin/roles, settings, settings/support-access, setup, home page); `platform/` vendor console; `labels/[id]/` print view; `session-expired/` route handler (clears dead session cookie).
- `components/` — `ui/` 21 vendored shadcn-style primitives on @base-ui (alert, badge, breadcrumb, button, card, checkbox, date-input, dialog, dropdown-menu, field, input, label, select, separator, sheet, sidebar, skeleton, table, tabs, textarea, tooltip) plus `app-sidebar.tsx`, `lab-switcher.tsx`, `support-banner.tsx`, `theme-provider.tsx`, `theme-toggle.tsx`.
- `lib/` — one folder per domain area, each with `types.ts` (Api interface), `mock.ts` (implementation against `lib/mock-db.ts`), `index.ts` (adapter switch): `auth/`, `batches/`, `equipment/`, `jobs/`, `labs/`, `methods/`, `platform/`, `qc/`, `settings/`, `users/`. Shared: `mock-db.ts` (the store, 2021 lines), `permissions.ts`, `lab.ts` (active-lab cookie), `navigation.ts`, `onboarding.ts`, `branding.ts` (`PRODUCT_NAME = "LIMS"`), `utils.ts`, `supabase/server.ts`.
- `hooks/` — `use-mobile.ts` only.
- `tests/` — `invariants/` (6 files), `triage/` (5 files), `helpers.ts`, `setup.demo.ts`/`setup.clean.ts`; 70 tests total across the two seed projects.
- `docs/` — stories (frozen Notion exports), decision-log.md, PROJECT_STATE.md, open-decisions.md, notion-amendments-2026-07-13.md, story-draft-embedded-worksheet.md, architecture-kaders.md, working-agreements.md, review-progress.md, build-report.md (superseded stub), 00-INDEX.md, research/.
- `proxy.ts` (project root) — the request middleware (Next 16 name; classic `middleware.ts` does not exist). `lims-supabase/` + `supabase/` — parked Supabase migrations/config.
- `AGENTS.md` — AI-agent instructions for the Next.js 16 API surface (not user documentation).

**UI language:** English throughout — all user-facing strings, validation messages, labels and docs-facing code comments are English. A grep for common Dutch UI words (aanmaken, opslaan, gebruiker, wachtwoord, monster, …) over `app/`, `lib/`, `components/` returns zero hits. The only Dutch-ish user-visible string is the demo seed's result-qualifier list entry `"n.b."` (`lib/mock-db.ts` line ~1043) — that is seeded DATA, not UI text. Consistent.

## 2. Routes and navigation

The app uses the Next.js App Router with two route groups: `(auth)` (public authentication pages) and `(app)` (the authenticated shell with sidebar and header). `/platform` (vendor console) and `/labels/[id]` (label print view) live **outside** both groups and render their own minimal chrome. Request-level guards live in `proxy.ts` at the project root (Next 16's middleware file name; there is no `middleware.ts`).

Two naming notes that apply everywhere: the org setting `jobLabel` renames the term "Job" across headings, buttons and messages (seeded default "Job"; routes always use `/jobs`), and the product name is the `PRODUCT_NAME` constant in `lib/branding.ts` (currently `"LIMS"`).

### 2.1 Application shell, auth, setup & platform

| Route | File | Purpose | How reached | Guards / redirects |
|---|---|---|---|---|
| `/login` | `app/(auth)/login/page.tsx` | Email/password login, optional MFA second step | Direct; every unauthenticated request is redirected here by `proxy.ts` | Public. Authenticated users hitting it are bounced to `/` (`proxy.ts`) |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | Request password-reset link | "Forgot password?" link on login card | Public; authenticated → `/` |
| `/reset-password?token=…` | `app/(auth)/reset-password/page.tsx` | Set a new password with a reset token from the URL (`searchParams.token`, defaults to `""`) | Reset link (in dev: printed in server console, token `demo-reset-token`) | Public; authenticated → `/` |
| `/session-expired` | `app/session-expired/route.ts` | GET route handler (not a page): ends any support session, deletes `lims_session` + `lims_support` cookies, redirects to `/login`. Exists because server components cannot delete cookies; prevents an infinite `/` ↔ `/login` loop for dead-but-cookie-carrying sessions | Redirect target from `resolveOrgContext()` / `requirePlatformAdmin()` when live re-validation fails | Explicitly passed through untouched by `proxy.ts` |
| `/` | `app/(app)/page.tsx` | Pure dispatcher, renders nothing: role `null` (platform admin w/o support session) → `/platform`; admin of an org with **zero labs** → `/setup`; otherwise → `/jobs` | Landing page after login; brand click targets | Session required (proxy + `resolveOrgContext`) |
| `/setup` | `app/(app)/setup/page.tsx` | First-run setup: freshly provisioned org has zero labs; the admin creates the real first lab | Redirect from `/` only | `resolveOrgContext()`; non-admin or no orgId → `/`; org already has ≥1 lab → `/` ("never shown again") |
| `/platform` | `app/platform/page.tsx` | Vendor-only platform console: list/provision/suspend/reactivate/deactivate organisations, open support sessions | Redirect target for platform admins; not in any sidebar | `proxy.ts`: non-platform-admin → `/`; page itself re-checks cookie role and redirects to `/`. Note: page checks the **cookie** role, the actions live-revalidate |
| `/settings/support-access` | `app/(app)/settings/support-access/page.tsx` | Customer side of vendor support: grant / revoke time-limited support access | Link/card from `/settings` (see §3.4, Settings card 8) + breadcrumb | `requireOrgAdmin()` in `app/(app)/settings/support-access/actions.ts`: live-validated org **admin** only; deliberately NOT reachable through a support session (a platform-admin fails the `role !== "admin"` live check); suspended org → `/session-expired` |

#### Middleware (`proxy.ts`, matcher `"/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"`)
- `PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password"]`. No session + non-public path → redirect `/login`. Session + public path → redirect `/`.
- `/session-expired` passes through untouched (must be able to delete the cookie itself).
- Platform boundary: non-platform-admin on `/platform*` → `/`; platform-admin outside `/platform*` **without** a support-session cookie → `/platform`.
- Sliding session: on every request with a session, the cookie is re-issued with the TTL embedded in the payload (`encodeSession(session.user, session.ttlMs)`). TTL is resolved once at login from org settings (`lib/auth/ttl.ts`, `sessionTimeoutMinutes * 60_000`; platform staff fixed 30 min) and clamped 5–480 min (`lib/auth/session.ts` `MIN_TTL_MS`/`MAX_TTL_MS`).
- Session cookie `lims_session`: httpOnly, sameSite lax, path `/`, maxAge = TTL; payload is **base64url JSON, unsigned** (forgeable by design of the mock — `lib/auth/session.ts` header comment). Middleware does routing only; the real boundary is `resolveOrgContext()` (`lib/auth/context.ts`), which re-validates every request against the live store (demotion/deactivation/lock/org-suspension take effect immediately) and sends dead sessions to `/session-expired`.

#### Layouts
- `app/layout.tsx`: fonts (Inter + Geist Mono), `ThemeProvider` (attribute `class`, defaultTheme `system`), `TooltipProvider`, `lang="en"`.
- `app/(auth)/layout.tsx`: centered card shell, `PRODUCT_NAME` wordmark, `ThemeToggle` top-right. No navigation before authentication.
- `app/(app)/layout.tsx`: the authenticated shell (sidebar + header + main). Details below.
- `/platform` and `/labels/[id]` are **outside** both groups: platform page renders its own minimal header (wordmark, "Platform console · vendor-only", ThemeToggle, user name, Log out); no sidebar.

### 2.2 Jobs & label printing

| Route | File | Purpose | How reached | Guards / redirects |
| --- | --- | --- | --- | --- |
| `/jobs` | `app/(app)/jobs/page.tsx` | Job overview (post-login landing page); read-only list scoped to the active lab, plus admin "Getting started" checklist | Sidebar (see §2.5), post-login redirect | `resolveJobActor()` (`app/(app)/jobs/actions.ts`): redirects to `/platform` when session has no org role. All org roles may view. |
| `/jobs/new` | `app/(app)/jobs/new/page.tsx` | Register a new job with samples | "+ New {job}" button on `/jobs` (admin/lab-manager only) | Server redirect to `/jobs` unless role is `admin` or `lab-manager` |
| `/jobs/[id]` | `app/(app)/jobs/[id]/page.tsx` | Job detail: header, Details / Samples / Batches / History tabs, all sample-level actions | Row click or job-number link on `/jobs`; redirect after create; breadcrumbs | `notFound()` if job unknown/other org/not visible to the actor's labs |
| `/jobs/[id]/edit` | `app/(app)/jobs/[id]/edit/page.tsx` | Edit job header + sample details (IDs immutable), add samples inline | "Edit {job}" button on detail Details tab | Redirect to `/jobs/[id]` unless `admin`/`lab-manager`; redirect if job is voided; `notFound()` if unknown |
| `/labels/[id]` (`?sample=<sampleId>` optional) | `app/labels/[id]/page.tsx` | Code 128 label print preview for all live samples of a job (or one sample) | "🖨 Print all" / per-row "🖨" buttons on the job detail Samples tab | Outside the `(app)` shell (no sidebar/header in print output). Redirect to `/jobs/[id]` when role is `read-only`, when the job is voided, or when zero labels would result; `notFound()` if job unknown |

Visibility rule (server, `lib/jobs/mock.ts` `canSee`): admins and support sessions see all org jobs; lab-scoped roles see jobs whose requested methods route work to one of their labs; a job with no methods at all stays visible to everyone in the org.

### 2.3 Batches

| Route | File | Purpose | How reached | Guards / redirects |
|---|---|---|---|---|
| `/batches` | `app/(app)/batches/page.tsx` (server) + `batches-client.tsx` (client) | Prioritised work queue of batches for the active lab (org-wide for admins in "All labs" view and support sessions) | Sidebar navigation (see §2.5); breadcrumbs from child pages | `resolveBatchActor()` (`app/(app)/batches/actions.ts:44`) redirects to `/platform` when the session has no org role. All org roles may view. |
| `/batches/new` | `app/(app)/batches/new/page.tsx` + `new-batch-client.tsx` | Assemble a new batch in the active lab: method (latest version pinned), eligible samples, QC positions, capacity counter | "+ New batch" button on `/batches` (shown only with an active lab and create rights) | `redirect("/batches")` when `actor.role === "read-only"`; `redirect("/batches")` when no active lab resolves (e.g. org-wide support session). Server re-validates all rules on submit. |
| `/batches/[id]` | `app/(app)/batches/[id]/page.tsx` + `batch-detail-client.tsx`, `results-grid.tsx`, `review-panel.tsx`, `import-dialog.tsx` | Batch detail: header, Samples/Steps/Results/Files/History tabs; the Results tab is the US-D4 entry grid while the batch is `open` and the US-D6 review panel afterwards | Clicking a row on `/batches` (`router.push`); redirect after creating a batch; links from job pages | `notFound()` when `batchApi.getBatch` returns null (unknown id, other org, or lab not visible to the actor). |
| `/batches/[id]/working-copy` | `app/(app)/batches/[id]/working-copy/route.ts` | GET download of the batch's working-copy file (served as `text/csv`, `Content-Disposition: attachment`) | "Working copy ⬇" link in the batch header and "Download" button on the Files tab | Returns 404 plain text `"Working copy not available."` when the API returns null (tenant/lab visibility enforced in `batchApi.workingCopyFile`). |
| `/batches/import-configs` | `app/(app)/batches/import-configs/page.tsx` + `configs-client.tsx` | CRUD for instrument-import configurations (masterdata; listed across all the actor's labs, org-wide for admins) | "Import configurations" button on `/batches` (admin/lab-manager with an active lab) | `redirect("/batches")` unless `actor.role` is `admin` or `lab-manager`. |

There are **no** `loading.tsx`, `error.tsx`, or `not-found.tsx` files anywhere under `app/(app)/batches/` (or the whole `app/` tree) — no route-level loading skeletons or error boundaries; Next.js defaults apply.

### 2.4 Masterdata, admin & settings

| Route | File | Purpose | How reached | Guards / redirects |
|---|---|---|---|---|
| `/methods` | `app/(app)/methods/page.tsx` | Method list (US-B1) | Sidebar nav (see §2.5); breadcrumbs | Server actor resolve (`resolveMethodActor` in `app/(app)/methods/actions.ts`): `redirect("/")` when role is null or no orgId. All org roles may view. |
| `/methods/new` | `app/(app)/methods/new/page.tsx` | Create a method | "+ New method" button on `/methods` (admin/lab-manager only) | `redirect("/methods")` when role is not `admin`/`lab-manager` |
| `/methods/[id]` | `app/(app)/methods/[id]/page.tsx` | View/edit one method, manage template + status | Method name link in the `/methods` table | `notFound()` when method missing, other-org, or not visible to the actor's labs. Non-managers get the same page read-only (`readOnly` prop). |
| `/quality/equipment` | `app/(app)/quality/equipment/page.tsx` | Equipment list with live availability (US-B3) | Sidebar (Quality section); breadcrumb chain starts at "Jobs" | `resolveEquipmentActor` (`app/(app)/quality/equipment/actions.ts`): `redirect("/platform")` when role null / no orgId (note: different redirect target than methods). All roles view. |
| `/quality/equipment/[id]` | `app/(app)/quality/equipment/[id]/page.tsx` | Equipment detail: overview, calibration, checks, method links, history | Row click in equipment table | `notFound()` when missing/other-org/not visible |
| `/quality/qc-materials` | `app/(app)/quality/qc-materials/page.tsx` | QC material list + dialogs (US-B2) | Sidebar (Quality) | `resolveQcActor` (`.../qc-materials/actions.ts`): `redirect("/platform")` when role null / no orgId |
| `/admin/labs` | `app/(app)/admin/labs/page.tsx` | Lab management (US-A5) | Sidebar (Admin) | `redirect("/")` unless role === `admin` |
| `/admin/users` | `app/(app)/admin/users/page.tsx` | User management (US-A6) | Sidebar (Admin) | `resolveActor` (`app/(app)/admin/users/actions.ts`): `redirect("/")` unless `admin` or `lab-manager` |
| `/admin/roles` | `app/(app)/admin/roles/page.tsx` | Read-only capability matrix reference (US-A4) | Sidebar (Admin) | `redirect("/")` unless role === `admin` |
| `/settings` | `app/(app)/settings/page.tsx` | Org settings: security, identifiers, lists, barcode, equipment window, per-lab toggles (US-A7) | Sidebar (Admin) | `requireAdminOrgId` (`app/(app)/settings/actions.ts`): `redirect("/")` unless `admin` |

Every mutating server action re-resolves the actor server-side from the session (`resolveOrgContext`); role checks are repeated inside `lib/*/mock.ts` per call (invariant 4). UI hiding is presentation only.

### 2.5 Navigation shell (sidebar, header, lab switcher)

Files: `app/(app)/layout.tsx`, `components/app-sidebar.tsx`, `lib/navigation.ts`, `components/lab-switcher.tsx`, `components/support-banner.tsx`, `components/theme-toggle.tsx`, `lib/lab.ts`.

Sidebar (`components/app-sidebar.tsx`, config in `lib/navigation.ts`, shadcn sidebar with `collapsible="icon"`, collapse state persisted in `sidebar_state` cookie read by the layout — default open unless cookie is `"false"`):
- Main group (all `requires: "view-data"`, which every org role has, so all five items are visible to admin, lab-manager, analyst and read-only):
  - Jobs → `/jobs` (icon ClipboardList)
  - Batches → `/batches` (Layers)
  - QC materials → `/quality/qc-materials` (FlaskRound)
  - Equipment → `/quality/equipment` (Microscope)
  - Methods → `/methods` (Beaker)
- Admin group (label "Admin", rendered only when non-empty):
  - Roles & permissions → `/admin/roles` — `requires: "org-settings"` (admin only)
  - Users → `/admin/users` — `visibleFor: ["admin", "lab-manager"]`
  - Labs → `/admin/labs` — `requires: "org-settings"` (admin only)
  - Settings → `/settings` — `requires: "org-settings"` (admin only)
  - Net effect: admin sees all four; **lab-manager sees only "Users"**; analyst/read-only see no Admin group.
- Visibility resolution `visibleNav()` (`lib/navigation.ts`): `visibleFor` wins over `requires`; `requires` goes through `can(role, capability)` from `lib/permissions.ts`. Role `null` (never rendered in practice — see ROLES) would show only items with neither condition.
- Active-section highlight `isActiveNav`: `pathname === href || pathname.startsWith(href + "/")`.
- Sidebar header: FlaskConical icon + product name; `SidebarRail` for collapsed-mode resize; per-item tooltip when collapsed.

Header bar (`app/(app)/layout.tsx`):
- `SidebarTrigger` with `aria-label="Toggle sidebar"`.
- Org label: `user.organisation`, or `"<orgName> (support)"` during a support session.
- Lab context: support session → static text "All labs"; admin → `LabSwitcher` with `allowAll` ("All labs" item + every active lab; "All labs" is the default via cookie sentinel `all`, `ALL_LABS` in `lib/lab.ts`); lab-scoped roles → `LabSwitcher` over their **assigned active labs** only. Single lab and not admin → plain text "Lab: {name}" (no select). Switching submits `setActiveLabAction` (`app/(app)/actions.ts`) via hidden form; server-side re-validation: live account, active org, `ALL_LABS` only for admins, lab id must be in `activeLabsForUser` (active labs; admins any active lab). Cookie `lims_lab` (httpOnly, lax, path `/`, session-lived), stores the lab **id**.
- Lab-reset notice: when a non-admin's lab cookie points at a lab no longer available, an amber banner appears: "Your active lab was reset to {lab name}." with an "OK" button that rewrites the cookie via `setActiveLabAction`.
- Right side: `ThemeToggle` (Sun/Moon, `aria-label="Toggle dark mode"`), "{user.name} ({role label})" using `ROLE_LABELS` (`Admin`, `Lab manager`, `Analyst`, `Read-only`, `Vendor support`), and a "Log out" button (form → `logoutAction`).
- `SupportBanner` (`components/support-banner.tsx`) under the header: renders only while `lims_support` cookie decodes to a live session — "Support session — vendor access (admin|read-only) · {orgName}" + "End session" button (→ `endSupportSessionAction`, redirects to `/platform`).

## 3. Per page: features and actions

### 3.1 Shell, auth, setup & platform pages

#### `/login` (`app/(auth)/login/page.tsx`, `app/(auth)/login/login-form.tsx`, `app/(auth)/login/demo-accounts.tsx`)
- Purpose: authenticate; two sequential cards — password step, then MFA step when the account requires it.
- Actions: submit login; submit MFA code; link "Forgot password?".
- Demo-accounts box: rendered only when `NEXT_PUBLIC_SUPABASE_URL` is unset AND `NODE_ENV !== "production"`. Lists mock accounts (full-seed: `admin@demolab.nl` "Admin, 2 labs (switcher)", `labmanager@demolab.nl` "Lab manager, Metals lab", `analyst@demolab.nl` "Analyst, MFA — code 123456", `readonly@demolab.nl` "Read-only", `vendor@lims.dev` "platform admin → vendor console", `user@oldcust.nl` "member of suspended org"; clean-seed `LIMS_CLEAN_SEED=1`: vendor only). Shows shared password `LabDemo2026!!`, "5 wrong attempts locks an account", reset token `demo-reset-token`.
- No tables, no modals, no dead controls.

#### `/forgot-password` (`app/(auth)/forgot-password/page.tsx` + `forgot-password-form.tsx`)
- Purpose: request reset link. Card text: "Enter your email address and we'll send you a time-limited reset link."
- Actions: submit email; "Back to login" link (also as a button after success).
- After submit the form is replaced by the info alert (enumeration-safe, identical whether the account exists).

#### `/reset-password` (`app/(auth)/reset-password/page.tsx` + `reset-password-form.tsx`)
- Purpose: set a new password using `?token=`. Hint text under the field: "At least 12 characters." (static — NOT read from the configurable policy; see §12.3).
- Actions: submit new password + confirmation; "Go to login" button after success.

#### `/` (`app/(app)/page.tsx`)
- Renders nothing; pure redirect dispatcher (see the §2.1 route table). No getting-started UI lives here — the phase-1 placeholder home is retired (comment in file); the "Getting started" checklist lives on the Jobs page (§3.2).

#### `/setup` (`app/(app)/setup/page.tsx`, `setup-client.tsx`, `setup/actions.ts`)
- Purpose: create the organisation's first lab. Card title "Welcome to {PRODUCT_NAME}"; description: "{org} has no labs yet. Create your first lab to start working — methods, equipment and batches live in a lab, and colleagues in lab-scoped roles are assigned to one. Jobs are organisation-wide: each requested method routes its work to the method's lab."
- Actions: single form (see §5.1). Live identifier preview: as the code is typed, an example batch number renders from the org's REAL `batchFormat` template (`renderTemplate` from `lib/settings/format-id.ts`; placeholder lab code `MET` until typed). Code input auto-uppercases on change.
- Footer text: "As an admin you have access to all labs of your organisation. Afterwards: add sample types under Admin ▸ Settings, colleagues under Admin ▸ Users, more labs under Admin ▸ Labs, and methods under Methods."
- No tables/modals/dead controls.

#### `/platform` (`app/platform/page.tsx`, `organisation-table.tsx`, `provision-dialog.tsx`, `platform/actions.ts`)
- Purpose: vendor console — organisation metadata only, never customer domain data. Footer text: "Platform admins see organisation metadata only. Domain data is accessible exclusively through a customer-granted support session, recorded in the customer's audit log."
- Actions: "+ New organisation" (dialog); per-row Suspend / Reactivate / Deactivate (dialog with mandatory reason); "Open session" (support session, only when a grant exists and no session is active); Log out; theme toggle.
- Table columns: Name (+ inline "setup pending" tag), Status (badge: `active` outline / `suspended` destructive / `deactivated` secondary), Subscription, Users (right-aligned count), Created, Support (grant status: "no grant" / "session active" / "{n}h left[ · admin]" + Open session button), Actions.
- Pagination: NO. Sorting: NO. Filtering: only the checkbox "Show deactivated ({count})" — deactivated orgs hidden by default; checkbox appears only when at least one exists.
- Row action visibility: `active` → Suspend + Deactivate; `suspended` → Reactivate + Deactivate; `deactivated` → Reactivate only.
- Status dialog (shared component, per-mode copy from `MODE_COPY`): title "{Suspend|Reactivate|Deactivate} {org name}"; body texts, each followed by "A reason is required and recorded.":
  - Suspend: "Users of this organisation will no longer be able to log in. No data is altered or removed; reactivation restores access exactly as it was."
  - Reactivate: "Users of this organisation will be able to log in again."
  - Deactivate: "The organisation and all its data are retained (nothing is ever deleted), but it leaves the active list and its users can no longer log in. Any support grant is ended. You can reactivate it later."
  - Required `reason` textarea; CTA "Suspend organisation" / "Reactivate organisation" / "Deactivate organisation" (destructive-styled for suspend/deactivate); dialog cannot be closed while pending (`onOpenChange` guard).
- Provision dialog: title "Provision a new organisation", description "Creates the organisation with seeded default settings and sends a time-limited setup invitation to its first administrator." Fields: Organisation name (required), First administrator's email (required, type email). Closes itself on success.
- Dead controls: none.

#### `/settings/support-access` (`app/(app)/settings/support-access/page.tsx`, `support-access-form.tsx`, `support-access/actions.ts`)
- Purpose: customer grants/revokes vendor support access. Breadcrumb Jobs › Settings › Support access. H1 "Vendor support access".
- Card title: "Support access is granted" (grant exists) or "No active grant". Description: "By default, the vendor has no access to the inside of your organisation. You can grant time-limited support access and revoke it at any moment. Active sessions and every support action appear in your audit log."
- No grant → grant form: Duration select (24 hours / "72 hours (default)" / 7 days; default 72), checkbox "Allow changes (admin rights) — otherwise read-only", button "Grant access".
- Grant exists → status box: "Expires in {n} hours", "Mode: changes allowed (admin rights)|read-only[ · a support session is active right now]"; destructive button "Revoke access now".
- No tables/modals/dead controls.

### 3.2 Jobs & label printing pages

#### /jobs (`app/(app)/jobs/page.tsx` + `app/(app)/jobs/job-overview.tsx`)
- Purpose: read-only job overview, filtered to the active lab picked in the shell (admins default to "All labs"; support sessions are always org-wide). Also hosts the admin-only "Getting started" onboarding card.
- Header subtitle states the scope: `"All labs (support session)"` / `"{lab name} lab"` / `"All labs"` / `"No active lab"`.
- Actions:
  - "+ New {job}" button → `/jobs/new` — rendered only for `admin`/`lab-manager`.
  - Free-text search input, placeholder `"Search {job} number or customer"` — client-side substring match (case-insensitive) on job id OR customer.
  - Four select filters (client-side): status (`All statuses` / `Not started` / `In progress` / `Completed` / `Closed`), sample type (`All types` + active types), method (`All methods` + org methods as "Name (CODE)"), customer (`All customers` + distinct customers from the visible rows).
  - Received date range: two dd-mm-yyyy `DateInput` fields ("Received from"/"Received until" aria-labels), compared against `receivedAt` date part.
  - "Reset" text button clears search + all filters (not the show-closed checkbox, not the sort).
  - Checkbox `"Show completed & voided {job}s"` — voided rows and completed rows are hidden by default; completed rows also reappear when the status filter is explicitly set to Completed.
  - Sorting: clickable header buttons on **{Job} no. / Customer / Received / Deadline** toggle asc/desc with ▲/▼ arrow; default sort `receivedAt` descending. "Sample type" and "Status" headers are not sortable.
  - Row click navigates to `/jobs/[id]`; the job number in the first cell is also a real `<Link>` (middle-click/new-tab capable).
- Table columns: `{Job} no.` (mono, link), `Customer`, `Received` (yyyy-mm-dd part), `Sample type` (single type name, `"Mixed"` when several, `"—"` when none), `Status` (emoji dot + label: ⚪ Not started / 🔵 In progress / ✅ Completed / ⚫ Closed; voided jobs show a secondary `voided` badge instead and render at 50% opacity), `Deadline` (`—` when none; amber text + ⚠️ when overdue = past or within 24 h and not completed).
- Pagination: none — all rows render.
- Getting-started card (admins only, hidden for support sessions and once complete; `lib/onboarding.ts` derives it live): title "Getting started", description "Set up the essentials for your organisation — this checklist follows your data and disappears once you're up and running.", checklist items as links with check icons, optional items marked `"optional"`.
- Modals: none.
- Dead controls: none found.

#### /jobs/new (`app/(app)/jobs/new/page.tsx` + `app/(app)/jobs/job-form.tsx`)
- Purpose: register a job (org-wide — form has no lab field; every active method of the org is offered, labelled `"{name} ({code}) · {lab name}"`).
- Job-number preview banner: `"{Job} number: <preview> — example; the final number is fixed on save."` The preview comes from `peekJobNumber` (`lib/jobs/ids.ts`) which does NOT consume the sequence; falls back to `"assigned on registration"` if the template renders empty.
- If the org has no active sample types, an alert renders: `"No sample types are configured yet — every sample needs one. Add them under Admin ▸ Settings ▸ Sample types first."`
- Form details in §5.2. Submit label `"Register {job}"` → on success server-redirects to `/jobs/{newId}`.
- Modals: none. Dead controls: none.

#### /jobs/[id] (`app/(app)/jobs/[id]/page.tsx` + `app/(app)/jobs/[id]/job-detail-client.tsx`)
- Purpose: full job record. Persistent header card shows: job id (mono) · customer · status (or `voided` badge) · due date (`"no deadline"` when empty; amber + ⚠️ when overdue). Voided jobs additionally show `"This {job} is voided: {reason}"` in red.
- Permission flags computed server-side: `canManage = (admin || lab-manager) && !voided`; `canPrint = role !== "read-only" && !voided`.
- Tabs: **Details | Samples | Batches | History**.
- Details tab: definition list of {Job} number, Customer, Customer reference, **"Lab (fixed at creation)"** (see §12.4 — value is actually the derived, comma-joined set of labs of the requested methods), Received, Received by, Priority, Due date, Storage location, Requested methods, Notes (empty fields are omitted entirely). Buttons (canManage only): "Edit {job}" → `/jobs/[id]/edit`; destructive "Void {job}" → Void dialog.
- Samples tab:
  - Count line `"{n} sample(s)"` (live samples only). Buttons: "+ Add sample" (canManage) opens Add-sample dialog; "🖨 Print all" (canPrint) → `/labels/[id]`.
  - Table columns: Sample ID (mono), Type, Cond. (`OK`, or amber ⚠ with the deviation note as `title` tooltip), Acceptance (`awaiting decision` in red / `Rejected` in red / `Accepted w/ reservation` / `Accepted`), Status (derived label: Voided / Rejected / Awaiting decision / In batch / In progress / Completed / Received), **Batch** and **Step** columns that always render `"—"` (see §12.4), Actions.
  - Row actions (canManage, non-voided sample): "Decision" (Acceptance dialog), "Consult" and "Evidence" (only when condition = deviation), "Void" (Void-sample dialog). Plus per-row "🖨" (canPrint, aria-label `"Print label for {id}"`) → `/labels/[id]?sample={id}`.
  - Voided or rejected sample rows render at 50% opacity but stay listed.
  - Below the table, reservation reasons and consultations are echoed as small text: `"{id}: reservation — {reason}"` / `"{id}: consultation — {who} · {outcome}"`.
- Batches tab: table of batches containing this job's samples (Batch link → `/batches/[id]`, Method + version, Status label or `Voided` badge, `Samples from this {job}` as mono id list). Empty state: `"No batches contain this {job}'s samples yet."`
- History tab: intro text `"A read-only view of the append-only audit trail for this {job} — every registration, edit (with before/after), acceptance decision, consultation, evidence upload and void, with actor and timestamp."` Table When (`yyyy-mm-dd hh:mm`) / User / Action, rendered straight from the job's `events[]`. No filter, search, pagination, or export.
- Dialogs (all in `job-detail-client.tsx`, all block closing while a submit is pending):
  - **Acceptance decision — {sampleId}**: description `"§7.4.3: every sample needs a decision before it can enter a batch. A rejected sample can never be batched."` Radio choice Accepted / Accepted with reservation / Rejected; choosing reservation reveals a required textarea "Reservation reason (carried to the report)". A pre-submit warning alert appears when the sample is a mismatch deviation without a recorded consultation: `"This sample does not match its description — record a customer consultation first."` Submit "Record decision".
  - **Customer consultation — {sampleId}**: description `"§7.4.3: record who was consulted, when, and the outcome. Required before accepting a sample that does not match its description."` Fields: "Who was consulted" (required), "When (optional)" (DateInput), "Outcome" (required textarea). Submit "Record consultation".
  - **Deviation evidence — {sampleId}**: description `"Optional photo/attachment stored immutably with a SHA-256 checksum (§7.4 / ADR-3)."` File input `accept="image/*,.pdf"`, required. Submit "Upload evidence".
  - **Void {job} {id}** / **Void sample {id}**: shared dialog, description `"Voided records are retained for the audit trail, never deleted. A reason is required."` Required "Reason" textarea; destructive submit "Void".
  - **Add sample**: description `"A new immutable sample ID is issued. Record the acceptance decision afterwards."` Fields: Type (select), "Description / matrix" (required), Customer sample ref (optional), Quantity (optional) + Unit, Requested methods checkboxes, "Deviation on receipt (§7.4)" checkbox revealing Cosmetic / "Does not match description" radios + "Deviation note" input. Submit "Add sample".
- Dead controls: the per-sample **Batch** and **Step** table columns (always `"—"`).

#### /jobs/[id]/edit (`app/(app)/jobs/[id]/edit/page.tsx`, same `JobForm` in edit mode)
- Purpose: edit header fields and non-voided samples; add new samples inline. Number banner reads `"{Job} number: {id} — fixed; never reissued."`
- Differences vs create: hidden `jobId` posted; existing samples show their immutable ID and CANNOT be removed (the ✕ remove button renders only for rows without an id, i.e. rows added in this session, and only while more than one row exists); voided samples are excluded from the form entirely; deactivated methods/types the job already references stay selectable (grandfathering).
- Submit label "Save changes" → stays on the page, shows a `"Saved."` alert (no redirect).

#### /labels/[id] (`app/labels/[id]/page.tsx` + `app/labels/[id]/labels-print.tsx`)
- Purpose: print preview of Code 128 labels for the job's live samples in numeric-aware sample-ID order, or a single sample via `?sample=`.
- Toolbar (hidden in print CSS): heading `"Print preview — Job {id}"`, config line `"Symbology: Code 128 · Size: {w} × {h} mm · Fields: {list}"`, count line `"{n} label(s)"` plus `"({m} voided sample(s) excluded)"` when applicable, hint `"No label printer? Choose "Save as PDF" in the print dialog — labels print at their configured physical size on standard stationery."` Buttons: "Cancel" (router → `/jobs/[id]`), "Print" (`window.print()`).
- Each label (`Label` component): SVG barcode of the sample ID (top, 42% height), always-printed human-readable sample ID, then optional lines gated by org barcode settings (`showCustomer`, `showSampleType`, `showJobNumber`, `showDate`); physical size from `barcode.widthMm`/`heightMm`; font scales with height. `@page { margin: 8mm }`.
- Barcode renderer (`lib/barcode/code128.tsx`): dependency-free Code 128 subset B SVG with checksum and ≥10-module quiet zones; if the ID contains characters outside ASCII 32–126 it renders a red dashed placeholder `"ID not encodable as Code 128"` instead of a wrong barcode. SVG has `role="img"` and `aria-label="Barcode {value}"`.
- Dead controls: none.

### 3.3 Batches pages

#### /batches (`app/(app)/batches/page.tsx`, `app/(app)/batches/batches-client.tsx`)
- **Purpose:** the lab's prioritised batch work queue (US-D2) with a summary strip, combinable filters, and inline claim.
- **Actions:**
  - Click a row → navigate to `/batches/{id}` (row-level `onClick`, not a link).
  - "Claim" button per row (only when `row.canClaim`) — submits `claimBatchAction`; error shown inline under the button (max-width 160px).
  - Click any of the four summary-strip counts to toggle that filter.
  - Set filters: step, status, method, assignee dropdowns; "Mine" toggle button; overdue toggle (via strip); free-text search; "Show completed & voided" checkbox.
  - "+ New batch" → `/batches/new` (visibility rules below), "Import configurations" → `/batches/import-configs` (admin/lab-manager, only with an active lab).
- **Summary strip** (each count clickable, computed client-side from the server-scoped rows): `Open` (status=open), `Awaiting review`, `⚠ Overdue` (rows with `overdue` flag), `Unassigned` (active rows with `assignee === null` — the *count* keeps the active-only rule while the *filter* matches finished batches too; comment cites "triage decision 14").
- **Table columns:** Batch (mono id + `⚠` overdue marker with `title="Deadline passed"`), Method (v) (label + version), Step / status (step name for open batches with the `At step ` prefix stripped; `BatchStatusBadge` otherwise), Pos. (`sampleCount + qcPositions`/`maxPositions`), Assignee (name or "—", plus badges "me" and destructive "unavailable" when `row.assignee && !row.assigneeCanAct`), Due (deadline or "—", amber when overdue), Created (`createdAt.slice(0, 10)`), and a trailing actions column with Claim.
  - **Pagination: no. Column sorting: no** (rows arrive in server order). **Filtering: yes**, all client-side:
    - Step filter: matches only `status === "open" && stepName === filter`. Options are the union of the active lab's current step names (`stepNameOptionsForLab`) and the current step names of listed open batches, sorted with `localeCompare` (page.tsx:39-44).
    - Status filter: all / At a step (open) / Awaiting review / Completed / Voided.
    - Method filter: distinct `methodId → methodLabel` of listed rows.
    - Assignee filter: All / Mine (`r.mine`) / Unassigned (`r.assignee !== null` excluded) / one concrete user (distinct assignees of listed rows).
    - Overdue toggle: `overdueOnly && !r.overdue` excluded.
    - Search: substring match on the batch id only (`r.id.toLowerCase().includes(q)`) — no other fields.
    - Finished batches (completed/voided) are hidden unless "Show completed & voided" is checked **or** the status filter explicitly selects that status.
- **Modals:** none on this page (Claim is inline).
- **Dead controls:** none found.
- **Header sub-line** states the scope: `"All labs (support session)"` / `"{lab name} lab"` / `"All labs — pick a lab in the header to create batches"` (admin without an active lab) / `"No active lab"`.
- **Footer note** under the table: "Assignment coordinates, it never gates — a cleared colleague can always act."

#### /batches/new (`app/(app)/batches/new/page.tsx`, `new-batch-client.tsx`)
- **Purpose:** create a batch in the active lab — pick a method (latest active version pinned), tick eligible samples, add QC materials with quantities, watch the live capacity counter.
- **Actions:** select method (switching resets samples/QC/confirmations); toggle "Requested for this method only" (default **on**; already-selected samples stay visible when toggled); check/uncheck samples; adding a sample that does **not** request the method opens a confirmation dialog first; check/uncheck QC materials; set a per-material quantity (number input min 1 max 99; invalid input silently coerces to 1 — `setQuantity`, client-side); submit "Create batch".
- **Tables/lists:** samples list is a checkbox list (mono id, type name, customer — description, `⚠ reservation` marker for `accepted-with-reservation`, "not requested" badge); QC list (code, name, type label, `lot …`/`exp …` suffixes, quantity input when checked). No pagination/sorting; the only "filter" is the requested-only checkbox.
- **Live counters:** card titles `Samples (n)` and `QC (n · m pos.)`; "Positions used: {n}/{max} ({s} samples + {q} QC)" turns destructive-red when over capacity.
- **Modal — add-method confirmation** (per not-requested sample): title `Add a method to {sampleId}?`, body "This sample does not request this method. Adding it to the batch will add the method to the sample's requested methods (recorded), so the {jobLabel}'s completeness stays meaningful." Buttons: "Cancel" / "Add sample and record the method".
- **Notices:** method without template → amber "The pinned method version has no template — the working copy will contain the batch sheet only."; pinning note "Version {n} is pinned at creation — publishing a newer method version later changes nothing on this batch."; no-QC-selected amber warning "⚠ No QC selected — the batch can be created, but a run without QC proves nothing about result validity (required QC per method arrives with US-B4)."; footer "Working copy: generated on create from the pinned template version, checksum recorded; the batch sheet lists the exact composition."
- **Submit button** disabled while pending, when no method, when zero samples selected, or when over capacity (client-side; server re-checks). On success the server action redirects to `/batches/{id}`.
- **Dead controls:** none found.

#### /batches/[id] (`app/(app)/batches/[id]/page.tsx`, `batch-detail-client.tsx`)
- **Purpose:** the full batch record — header with status/assignment/deadline, five tabs, and every workflow action.
- **Header** shows: mono batch id; method label + `v{n} (pinned)`; status badge + human status label; destructive badge `⚠ amendment check required` when any result has `amendmentCheckRequired` (title: "A result was replaced after completion (§7.8.8)"); counts line "{s} samples + {q} QC · {u}/{max} positions"; "created {yyyy-mm-dd hh:mm} by {email}"; deadline ("due {date} ⚠" amber when overdue / "no deadline"); assignee ("— (open pool)", "(you)" suffix, destructive "unavailable" badge when the assignee can no longer act, with an explanatory `title`); inline Claim / Release claim buttons; "Assign…" (managers, active batches); "Working copy ⬇" link when downloadable.
- **Voided banner** (destructive Alert): title "Voided batch", body "{voidReason} — the record, files and history remain; its samples returned to Received and can be re-batched."
- **Assigned-to-other warning** (open batch, actor can work): "⚠ Assigned to {name} — you can still act on this batch (open pool); the assignment only signals who is on it."
- **Tabs** (default **Steps**): Samples, Steps, Results, Files, History.
- **Samples tab:** samples table — columns Sample (mono id + destructive "voided" badge; row at 60% opacity when voided), {jobLabel} (link to `/jobs/{jobId}`), Type, Customer / description (truncated), Acceptance ("Accepted" or amber "⚠ with reservation"), State (this method) (Received / In batch / In progress / Completed from `sampleProgress`). "Edit composition" button when `canEdit`. When composition is locked but the batch is open: "Composition is locked (work has been recorded) — a set-back never reopens it." QC table — Code, Material (name + type label), Lot, Expiry, Quantity (`×n`); empty state amber "⚠ This batch carries no QC (allowed, but flagged — required QC per method arrives with US-B4)."
- **Steps tab:** linear rail — `✓` completed / `►` current / `○` pending, "{index+1}. {name}", last-completion line "— {by}, {at} · {equipment names}". "Complete step" button on the current step when `canWork`. Manager buttons: "Set back…" (only when awaiting-review or `currentStepIndex > 0`) and "Void batch…" (destructive-styled ghost). Awaiting-review Alert: "All method steps are complete — the batch is **awaiting review** Review is a system phase, not a configurable step." (note: a period is missing after "review" in the source string). Footnotes: "Completing "{step}" requires selecting the {type names} used — Blocked items cannot be selected." and "The workflow is strictly linear; a redo after a set-back creates a new completion record and the original stays in History."
- **Results tab:** `ReviewPanel` when status ≠ open and a review view loads; otherwise `ResultsGridSection`; fallback text "The results grid could not be loaded." when `grid` is null.
- **Files tab:** three cards.
  - *Working copy:* "{fileName} · sha256 {first 16 hex}… · generated {at}"; "Download" button, or for seeded batches without bytes: "(Seed demo — the file bytes are not retained; newly created batches are downloadable.)"; "No working copy generated." when absent.
  - *Completed worksheet:* version list "v{n} (current) — {fileName} · sha256 {16}… · {at} by {email}"; empty state "Not attached yet — the final step cannot be completed without it (the transition to review is gated on the completed worksheet, US-D4)."; upload form (open batches, `canWork`); note "Replacing uploads a new version — nothing is ever overwritten."
  - *Imports:* per import event "{fileName} · sha256 {16}… · {at} by {email}" and "config "{name}" (mapping frozen on the event) · {n} row(s) imported · {n} skipped · {n} rejected[ · {n} kept existing][ · replacements: {reason}]"; empty state "No instrument imports yet."; note "Each import is one self-contained event: the original file, its checksum, the applied mapping and every row's outcome — reproducible from the event alone."
- **History tab:** table When (mono, `yyyy-mm-dd hh:mm`) / Who / What, rendering `detail.events` sorted newest-first — the event list itself, no filters, no pagination. Footnote: "Reagent lots: — (relation reserved; administration is post-MVP). Results and review events join this trail with US-D4/D6."
- **Modals** (all `Dialog`s, each closable unless a submit is pending):
  - **Complete step** — title "Complete step {n} — {name}", description "The completion record stores who, when[ and the specific equipment used] — it becomes part of the batch's proof of how the work was performed." One `Select` per required equipment type (placeholder "Choose the {type} used"; options append " — ⚠ due soon" when applicable; per-choice amber warning line; blocked items listed read-only as "{name} ({assetId}) blocked — {first reason}"). A type with zero usable options renders destructive text "No usable {type} in this lab — the step cannot be completed until one is fit for use." and keeps the submit disabled (`deadType`). Warning when assigned to someone else: "⚠ Assigned to {name} — assignment coordinates, it never gates. Continue?". Submit "Confirm completion" disabled until every required type has a choice. Carries `expectedStepIndex` as a concurrency token; stale pages get "This batch changed while you were looking — refresh the page and try again." (`lib/batches/mock.ts:976`).
  - **Set back** — title "Set back — {batchId}", description "A set-back returns the batch for rework: redoing a step creates a new completion record (the original stays in History) and composition never reopens." Target-step `Select` (from review: any step; from a step: only earlier steps; defaults to the last allowed) + required `Textarea` "Reason (required)". Submit "Set batch back".
  - **Void batch** — title "Void batch — {batchId}", description "The batch stays viewable with its files and history; its samples return to Received and can be re-batched. Results already recorded can never become valid." Required reason. Destructive submit "Void batch".
  - **Edit composition** — title "Edit composition — {batchId}", description "Possible only while the batch has never left its first step and no work is recorded. Removing a sample returns it to Received for this method; every change is recorded and the working copy is regenerated." Checkbox lists of member + addable samples (badges "not requested", destructive "voided — uncheck to remove") and QC options (badge "no longer offered" for held-only entries; quantity inputs 1–99). Adding a non-requested, non-member sample opens the same nested add-method confirmation dialog as on `/batches/new`. Submit "Save composition" (disabled at zero samples).
  - **Assign** — title "Assign — {batchId}", description "The assignee signals who is on it; a cleared colleague can still act (open pool). Only users allowed to work on this batch can be assigned." Info Alert when the current assignee can no longer act: "The current assignee ({name}) can no longer work on this batch (deactivated, moved lab, or clearance revoked) — choose a new assignee or return it to the open pool." Select with "— Unassigned (open pool) —" + assignable users. Submit "Save assignment".
- **Dead controls:** none found.

#### /batches/[id] — Results tab, entry mode (`app/(app)/batches/[id]/results-grid.tsx`)
- **Purpose:** the US-D4 result-entry grid: rows = samples + QC units, columns = the pinned method version's analytes.
- **Header:** "Results — entry open|entry closed · {filled}/{total} filled". When entry is closed, an Alert shows the server's reason (`entryClosed`, `lib/batches/mock.ts:2980`): review → "Entry is closed during review — the reviewer judges a stable snapshot; a set-back (US-D3) reopens it."; voided → "This batch is voided — its records are frozen."; completed → "This batch is completed — its records are frozen."
- **Actions** (all only when `canEnter && grid.entryOpen`): "Import file…", "Paste block…", "Read from worksheet…" (the last only when `grid.worksheetCount > 0`); click any cell to open the cell dialog.
- **Grid table:** first column Row (mono label, "QC" outline badge for QC rows, destructive "voided" badge, truncated sub-line), then one column per analyte "{name} ({unit}|no unit)". Cells are real `<button>`s showing the current value (`display()`: numeric as stored; censored as `<0.010`; qualifier label; text; italic "no result"), `⟳` suffix when the chain has >1 record (title "Corrected — open for the chain"), or "—" when empty; `title` shows "{origin} · {enteredBy}" on filled cells or "Enter result" on empty enterable cells; disabled when neither enterable nor filled. No pagination/sorting/filtering.
- **Footer:** "Values are stored with full precision exactly as entered; comma or point decimals are accepted only when unambiguous — never guessed. Corrections require a reason and keep the original (⟳ opens the chain). Agreement with QC expectations is judged in epic E, not at entry."
- **Cell dialog** — see §5.3 and §4.1.
- **Paste / worksheet / import dialogs** — see §4.1.

#### /batches/[id] — Results tab, review mode (`app/(app)/batches/[id]/review-panel.tsx`)
- **Purpose:** US-D6 review — same grid, read-only values with origin/validity, QC expectations under each QC cell, per-result validity decisions, gap closure, completion, post-completion replacement.
- **Header:** "Review — {n} pending · {m} gap(s)" while awaiting review; "Results (reviewed) — locked — corrections via replace-with-reason only" when completed.
- **Alerts:** amendment flag (destructive) "⚠ Report impact — **amendment check required (§7.8.8)**: one or more results were replaced after completion. Epic F's amendment flow consumes this flag."; reviewer-blocked info Alert with the server reason, e.g. "This lab requires the reviewer to differ from the performing analyst(s) — you completed steps or entered results on this batch (per-lab setting, US-A7)." (`lib/batches/mock.ts:2284`).
- **Per cell:** value button (click → read-only chain dialog), origin in small caps, `ValidityBadge` (green "valid" / destructive "rejected" with the reason as `title` / secondary "pending"), `⚠` when `amendmentCheckRequired`, then per state: `✓` valid button (tiny form) and `✗` reject button (opens dialog) while reviewing and `canReview`; "Replace…" button when completed and `canReview`. QC expectation lines like "expected 5.0 mg/L ±10% (lot L-123)" or "expected < LOQ (0.010 mg/L)" render under QC cells (built in `qcExpectationsFor`, `lib/batches/mock.ts:2296` — frozen snapshots, never live masterdata).
- **Gaps panel** (reviewing, `gaps.length > 0`): "Open cells: {n} — no silent holes; each is re-measured via set-back (Steps tab) or explicitly closed as no result + reason. Sample and QC cells alike; a rejected value stands only once superseded." Per gap: "{label} × {analyteName}", destructive note "rejected — needs closure" for kind `rejected`, and "Close as no result…" button when `canReview`.
- **Complete controls** (reviewing, `canReview`): "Validate all unflagged ({undecidedCount})" (disabled at 0) and "Complete batch" (disabled while `completeBlockers` non-empty, with inline "blocked: {blockers joined with · }"). Blocker strings from `completionState` (`lib/batches/mock.ts:2378-2387`): "{n} cell(s) without a result — fill via set-back or close as no-result + reason", "{n} rejected result(s) without a superseding value or no-result — re-measure via set-back or close as no-result", "{n} result(s) still awaiting a valid/rejected decision". Footnote: "Completion is the approval act and is final — corrections afterwards go through replace-with-reason (§7.8.8 flagged); a structural redo is a new batch."
- **Footer:** "No pass/fail verdict is rendered — automated QC evaluation is epic E; this view gives the human reviewer the exact lot expectations and reporting limits to judge against."
- **Modals:** Reject, Close gap and Replace (all in §5.3), and a read-only "Record chain — {label}" dialog ("Newest first; nothing is ever overwritten.") listing each record: value, "(current)"/"(superseded)", origin, worksheet version, enteredBy, timestamp, "— corrects the previous: {reason}", "· {validity}[ ({validityReason})][ by {validitySetBy}]", "· ⚠ §7.8.8" when flagged.

#### /batches/import-configs (`app/(app)/batches/import-configs/page.tsx`, `configs-client.tsx`)
- **Purpose:** manage the declared mappings instrument exports are read with (US-D5 AC 1). Page intro: "How instrument exports are read: orientation, column mapping (with units — the factor-1000 guard) and the declared separators. Declared, never auto-detected (ADR-4)."
- **Actions:** "+ New configuration"; per row "Edit" and "Deactivate"/"Reactivate" (status change with mandatory reason). No delete anywhere.
- **Table columns:** Name, Lab (resolved name), Type (uppercased csv/excel), Orientation, Separators ("decimal: ," or "." plus the CSV delimiter for CSV configs), Mapping (wide: "Header→Analyte, …"; long: "{analyteColumn}/{valueColumn}"; truncated), Status (outline "Active" / secondary "Inactive"; inactive rows at 60% opacity), Actions. **No pagination, no sorting, no filtering/search.**
- **Modals:** Config create/edit dialog and Status dialog — details in §5.3. Status dialog description: "Configurations are deactivated, never deleted — past imports stay explainable because every import event froze the mapping it applied."
- **Dead controls:** none found. (But see §12.5: the empty-state `colSpan` is 7 for an 8-column table, and its text still says "in this lab" although the list is no longer lab-scoped.)

### 3.4 Masterdata, admin & settings pages

#### /methods (`app/(app)/methods/page.tsx`)
- Purpose: list all methods visible to the actor (admins: whole org; others: own lab(s) via `canView` in `lib/methods/mock.ts:36`).
- Actions: navigate to detail (name link); "+ New method" button (admin/lab-manager only).
- Table columns: Name (link; plus a secondary `no template` Badge when `hasTemplate` false), Code (mono), Lab, Steps (right, count), Analytes (right, count), Accredited ("✓" / "–"), Status (Badge "Active"/"Inactive"), Version ("v{n}" plus "in use" note when `usedByBatches`). **No pagination, no sorting, no filtering, no search.**
- Modals: none.
- Dead controls: none.

#### /methods/new (`app/(app)/methods/new/page.tsx`)
- Purpose: create a method via the shared `MethodForm` (`app/(app)/methods/method-form.tsx`). Intro text: "The data-entry template is uploaded on the method page after creation."
- Actions: fill form, submit "Create method" → on success server action redirects to `/methods/{id}`.
- Labs offered: active labs only; lab managers see only their own lab(s). Equipment-type checkboxes per step come from the org type list.

#### /methods/[id] (`app/(app)/methods/[id]/page.tsx`)
- Purpose: edit method (same `MethodForm`, prefilled), manage status, manage data-entry template.
- Header shows: "Edit method — {name}" (or "Method — {name}" read-only), "Version {n} ({status})", Badge "in use by batches", "· {n} versions retained for traceability" when >1, and "Deactivation reason: {reason}" when inactive.
- Actions: save (creates new version when used by batches — banner: "This method has been used by batches — saving your changes creates a new method version. Existing batches keep the version they ran under."); Deactivate/Reactivate (dialog with required reason); upload/replace template (file input, `accept=".xlsx,.xls,.csv"`, "Template includes the standard Results sheet…" checkbox); view template version history (list of `v{n} · file · date · sha256 prefix`).
- `canManage` = admin, or lab-manager whose labs include the method's lab. Non-managers: all inputs `disabled`, no submit button, no status button, no upload form.
- Modals: **Deactivate/Reactivate method** (`MethodStatusForm` in `method-detail-client.tsx`) — title "{Deactivate|Reactivate} method", body: "The method can no longer be selected for new batches. Nothing is deleted: history, versions and clearance records stay intact." / "The method becomes selectable for new batches again." + "A reason is required and recorded." Reason Textarea `required autoFocus`; submit button destructive-styled when deactivating.
- Dead controls: none.

#### /quality/equipment (`app/(app)/quality/equipment/page.tsx` + `equipment-client.tsx`)
- Purpose: org/lab equipment with live-derived availability. Footer text: "The state is computed live from calibration, required checks and out-of-service — Blocked equipment cannot be used for work (gating enforced in epic D). Recovery is by resolving the condition; there is deliberately no manual "unblock"."
- Actions: "+ New equipment" (admin/lab-manager — opens create dialog); "Manage types" (admin only — type manager dialog); row click → detail page.
- Filters (all client-side, `equipment-client.tsx:342`): text search on name OR assetId (case-insensitive substring); Lab select ("All labs" + distinct lab names of listed items); State select (All states / Available / Due soon / Blocked); "Show inactive" checkbox (inactive rows hidden by default). **No pagination, no column sorting.**
- Table columns: Name, ID (mono assetId), Type, Lab, Calibration (— / "Expired {date}" destructive / "Due {date}" amber / "Valid →{date}"), Checks (— / "Failed" / "Overdue" / "Due today" / "OK (today)" / "OK ({date})"), State (Badge Blocked/Due soon/Available), Status (Active/Inactive badge). Inactive rows at 60% opacity.
- Modals:
  - **New equipment** (`EquipmentDialog`): "The equipment ID is unique within the organisation and stays with the asset for good. Calibration, routine checks and method links are added on the detail page afterwards." When the org has zero active equipment types the form is replaced by an Alert: "No equipment types are configured yet — every piece of equipment needs one." (+ " Ask an Admin to add them under Manage types." for non-admins) and, for admins, a "Manage types" jump button.
  - **Equipment types** (`ManageTypesDialog`): "Types are configurable per organisation and deactivated, never deleted — existing equipment keeps a deactivated type; it just stops being offered for new equipment." Per-type row: rename input + "Rename", "Deactivate…/Reactivate…" toggle revealing an inline reason form ("Reason (required)" placeholder) + "Confirm". Add row: "Add new type…" input + "Add".
- Dead controls: none.

#### /quality/equipment/[id] (`app/(app)/quality/equipment/[id]/page.tsx` + `detail-client.tsx`)
- Purpose: full equipment record. Header: name + (assetId), availability badge, "Inactive" badge, bullet lists of `blockedReasons` (destructive) and `warnings` (amber) from `equipmentAvailability` (`lib/equipment/mock.ts:177`).
- Header actions (canManage = admin/lab-manager, not lab-scoped at button level — server re-checks lab): "Edit", "Take out of service" (hidden while already out of service), "Deactivate…/Reactivate…".
- Out-of-service Alert (destructive): title "Out of service", body "{reason} — since {datetime} by {email}. Only an explicit return to service clears this." plus inline **Return to service** form (optional note input, placeholder "e.g. repaired and verified").
- Tabs: Overview / Calibration / Routine checks / Methods / History.
  - **Overview**: read-only grid — Type (with "(inactive type)" suffix), Lab, Manufacturer, Model, Serial number, Location, Created, Description, and "Last status change" reason when present.
  - **Calibration**: Interval ("{n} months"/—), Last calibration, Due (with "(set manually)", "(expired)" destructive, "(due soon)" amber); explainer "Calibration due dates within {warningDays} days show as "Due soon" (configurable in Settings). An expired calibration blocks the equipment until a renewed calibration is recorded."; "Update calibration" button (manage only); **Calibration certificate** block: filename · sha256 prefix · uploaded date/by, upload/replace form (`accept=".pdf,image/*"`).
  - **Routine checks**: Check-types table (Type [+ "retired" badge], Frequency [Per use/Daily/Weekly], Criterion [manual description or "{expected}{unit} ± {tol}"], Last check [datetime + Pass/Fail badge + "computed" marker], Next due [date, "per use", or —], Actions [Edit (active only), Retire/Reactivate]); "+ Log check" (any role except read-only, only when ≥1 active check type AND equipment status active); "Define check type" (manage). **Check log (append-only)** table: Date/time, Check, Performer, Measured (mono), Result badge, Notes; footer "Entries are never edited or removed — corrections are new entries, and failed or late checks stay visible here even after the equipment recovers."
  - **Methods**: linked methods/steps list with "(whole method)" suffix, "inactive" badge, "moved — other lab" badge; "Edit links" (manage).
  - **History**: read-only table When / Who / What (event type uppercased + summary), sorted newest-first; footer "Whether anything was Blocked, when, and why stays answerable here — the real backend mirrors this into the organisation-wide audit log." **No filtering or search on history.**
- Modals (each closes on success via effect; all block close while pending):
  - **Edit equipment**: "Every change is recorded in the equipment history with its old and new value." Equipment ID field is `readOnly` with `bg-muted` and title tooltip "The equipment ID is fixed once created — it names the physical asset."
  - **Update calibration**: "The due date derives from the last calibration plus the interval; enter it manually only when the certificate states a different one. Renewing the calibration is what clears an expiry block — the requirement itself can never be removed." Due-date helper: "Leave empty to derive it."
  - **Define/Edit check type**: "With a numeric criterion the system computes pass/fail from the measured value — it cannot be overridden. Changing a criterion never rewrites already-logged results." Radio choice Numeric vs Descriptive; numeric row = expected value, unit (+ "no unit" checkbox), ± / % select, tolerance.
  - **Retire/Reactivate check type**: "A retired check stops being required (it no longer blocks), but its logged history stays." / "The check becomes required again. If it was never performed or is overdue, the equipment blocks until a new check passes." Reason required.
  - **Log check**: "Checks are append-only: a typo is corrected with a new entry, never by editing. The performer and time are recorded automatically." Criterion echo line; measured value required iff numeric; manual criterion shows Pass/Fail radios.
  - **Linked methods / steps**: "A step requiring this equipment cannot be completed while it is Blocked (enforced in epic D). Linking the method as a whole applies to all of its steps." Checkbox tree (whole method + per step); grandfathered section "Held links to methods no longer offered here (inactive or moved) — uncheck to unlink:".
  - **Take out of service**: "The equipment stays Blocked until an explicit return to service. Both actions are recorded in the history." Reason required; destructive submit.
  - **Deactivate/Reactivate**: "Equipment is deactivated, never deleted — all calibration and check history is retained[ and it can be reactivated later]." Reason required.
- Dead controls: none.

#### /quality/qc-materials (`app/(app)/quality/qc-materials/page.tsx` + `qc-client.tsx`)
- Purpose: QC materials (blanks, control standards, CRMs) per lab. Footer: "Expired materials cannot be selected when composing a batch (epic D); pass/fail comparison against these values runs in epic E."
- Actions: "+ New QC material" (admin/lab-manager); per row (manage only): "Edit", "New lot" (prefills a NEW record, drops lot/expiry and expected-value ids).
- Table columns: Name (+ 📄 marker with title "Certificate on file"; amber "no certificate" text for CRM without one), Code (mono), Type (Blank / Control standard / CRM (certified)), Lab, Lot (mono/—), Analytes (count; "—" for blanks), Expiry (— / "{date} expired-badge" / "{date} ⚠ expires soon" [within 30 days, `SOON_DAYS = 30` in `lib/qc/mock.ts:13`] / plain date), Status badge, Actions. **No pagination, sorting, filtering, or search.**
- Modal: **MaterialDialog** (create / edit / new-lot). Description for create/edit: "The type determines how epic E judges results: Blank = below the method's reporting limit; Control standard / CRM = value ± tolerance." For new-lot: "A new lot is entered as a new record — the old lot keeps its own values and history (AC 7). The code must be unique among active materials in the lab, so give this lot a different code or deactivate the old lot first." Edit mode adds Status radios (reason Textarea appears only when the status changes: "Reason for {deactivating|reactivating} (required)") and a Certificate section with upload/replace form. Expected-values rows hidden for Blank type (rows preserved in state so switching back restores them). Hint: "Values use a decimal point (e.g. 5.0). Analytes match methods by name (case-insensitive) and unit."
- Dead controls: none.
- Implementation note: the server page pre-loads the FULL record of every listed material into a `details` map passed to the client for the dialogs (`page.tsx:25-29`) — all material data ships in the page payload.

#### /admin/labs (`app/(app)/admin/labs/page.tsx` + `labs-client.tsx`)
- Purpose: list/create/edit labs; labs are never deleted.
- Actions: "+ New lab" dialog; per-row "Edit" dialog.
- Table columns: Name (+ description as sub-line), Code (mono), Users (count), Methods (count), Equipment (count), Status badge, Actions ("Edit"). **No pagination/sorting/filtering/search.**
- Modals: **New lab** — "The short code is used in job and batch identifiers and must be unique within your organisation." Fields Name, Code, Description/location. **Edit lab** — "Changing the code never rewrites identifiers that were already issued with the old code — those stay as issued, for traceability." Adds Status radios; when the status changes a required reason Textarea appears ("Reason for {deactivating|reactivating} (required)"); otherwise shows "Last status change: {reason}". Footer: "Labs are deactivated, never deleted — historical data and links are always retained."
- Dead controls: none.

#### /admin/users (`app/(app)/admin/users/page.tsx` + `users-client.tsx`)
- Purpose: user accounts of the organisation. Admins see all; lab managers see only users sharing a lab and can only manage Analyst/Read-only.
- Actions: "+ New user"; per-row "Edit"; inside Edit: "Send password reset", "Unlock account" (only when the row is locked).
- Table columns: Name (+ "(you)" marker; destructive "locked" badge), Email, Role (label), Lab(s) (comma list), Status badge, Last login (—/date), Actions. **No pagination/sorting/filtering/search.**
- Modals: **New user** — "The user receives an email invitation to set their own password and enrol MFA if required — you never set or see it." Submit label "Create user & send invitation". (Mock reality: no email; the account's password is preset to the demo password and a console.log announces the invitation — `lib/users/mock.ts:179,194`.) **Edit user** — "Users are deactivated, never deleted — historical actions stay attributable." Role select limited to Analyst/Read-only for lab-manager actors (`roleOptions`, `users-client.tsx:58`). Lab checkboxes limited to active labs in the actor's scope. "Method clearances" checkbox grid appears only when role = Analyst, with note "An Analyst can only enter data and advance steps for methods they are cleared for." Out-of-scope clearances listed as "Also holds (kept for the audit trail, not editable here): …". Status radios (no reason field — user status changes require no reason, unlike labs/methods/equipment/QC). Info alerts: "Password reset sent to {email}." / "Account unlocked."
- Dead controls: none.

#### /admin/roles (`app/(app)/admin/roles/page.tsx`)
- Purpose: read-only rendering of the capability matrix from `lib/permissions.ts` (single source of truth; the page never redefines it).
- Content: table Capability × (Admin, Lab manager, Analyst, Read-only). Rows: View data; Create jobs; Create batches; Enter data / advance steps; Review & approve; Manage methods / equipment / QC; Assign method clearances; Manage users; Organisation settings. Cell values: check icon (aria-label "allowed"), minus icon (aria-label "not allowed"), "✓ *" (cleared-only), "– †" (per-lab-setting). Footnotes: "* Analyst: only for methods the user is individually cleared for."; "† Configurable per lab (default off, Settings — US-A7); when on, only for cleared methods."; "Vendor support sessions use this same matrix: a read-only grant acts as Read-only, an admin grant as Admin."
- Actions: none — fully static. No dead controls (nothing pretends to be editable).

#### /settings (`app/(app)/settings/page.tsx` + `settings-client.tsx`)
- Purpose: admin-only org configuration, in stacked cards, each card its own independent form with its own Save button. Page intro: "Organisation-wide configuration and per-lab options. Every change is recorded in the audit log with its old and new value."
- Cards/sections and actions:
  1. **Security** — min password length, lockout threshold, session timeout ("Applies from each user's next login — running sessions keep their current timeout until then."), Require password complexity checkbox, Require MFA checkbox.
  2. **Identifiers & labels** — job/sample/batch format inputs with LIVE preview per field ("Preview: {rendered}") computed client-side by `previewIds` (`lib/settings/format-id.ts:37`) using the viewer's active-lab code (fallback: first active lab; "LAB" only when the org has no labs). Card description documents the token rules: "Tokens: {YY} {YYYY} {MM} {SEQ:000}; sample numbers use {JOB} (required) and batch numbers {LAB} (required — batch sequences run per lab). Jobs are organisation-wide, so {LAB} is not available for job or sample numbers. Format changes affect newly generated IDs only; issued IDs are never altered." Sequence reset radios never/yearly/monthly with note "Job sequences count per organisation, batch sequences per lab, and sample sequences restart per job — organisations never share a counter." Plus "Label for "job" (shown across the UI)" text input.
  3. **Sample types** (ListSection) — description "Used at sample registration."
  4. **Result qualifiers** (ListSection) — description "Extra qualifiers available at result entry beyond the fixed < and >." Both lists: per-item rename Input + Active checkbox (+ "inactive" badge), one "Add new…" input, note "Entries are deactivated, never deleted — historical records keep their value." A single Save submits renames + toggles + the new item together (there is no per-item Add/Delete button; delete does not exist).
  5. **Barcode labels** — Symbology shown as a read-only Input "Code 128" with note "QR / DataMatrix — later." (deliberate placeholder, not a dead control in the clickable sense); Width/Height mm; Label fields checkboxes: Sample ID (checked + disabled — always printed), Customer, Sample type, Standalone job number, Receipt date.
  6. **Equipment** — "Calibration warning window (days)"; description "Calibration due dates inside this window show as "Due soon" — a warning, not a block."
  7. **Lab settings** — lab Select then per-lab checkboxes "Analysts may create batches (cleared methods only)" and "Reviewer must differ from the performing analyst(s)"; "Per-lab workflow options; take effect immediately." Form is keyed by lab id so switching labs resets stale success/error messages.
  8. **Vendor support access** card — only a link "Open support access →" to `/settings/support-access` (documented in §3.1).
- Save feedback per card: button "Saving…" while pending, then inline "Saved." text on success or a destructive Alert with the server message on error (`SaveRow`, `settings-client.tsx:33`).
- Dead controls: none (the read-only Symbology input and always-on Sample ID checkbox are intentionally non-interactive with explanatory text).
- Note: there is **no "deactivate organisation" control on /settings** — organisation status management lives on `/platform` (see §3.1).

## 4. Data entry

How data gets into the system: (a) classic server-action forms on every page (detailed per form in section 5); (b) the batch results grid's entry mechanisms — manual per-cell dialogs, bulk paste, worksheet upload with auto-read, and instrument file import (§4.1); (c) file uploads that store bytes without parsing them (deviation evidence, calibration/QC certificates, method templates — §4.2–4.3). **No spreadsheet-like or grid-based editing environment exists anywhere in the code** — the "embedded worksheet" is a decided future direction with a story draft only (§4.1 point 6, and section 11).

### 4.1 Batches area (results entry, paste, worksheet, import)

The batches area is where nearly all measurement data enters the system. Five mechanisms exist; each writes append-only `MockMeasurementRecord`s via one shared `appendRecord` path (`lib/batches/mock.ts:3075`) which also flips the one-way composition latch.

#### 1. Manual per-cell entry (CellDialog, `results-grid.tsx:75-237`)
- Click a grid cell → dialog with a **Type** select: `Numeric`, `< (below boundary)`, `> (above boundary)`, one entry per active org result-qualifier ("{name} (qualifier)"), `Qualitative text`, `No result (with reason)`.
- Numeric: one text `Input` (`name="raw"`, mono, autoFocus, placeholder "e.g. 12.4").
- Censored: a Boundary input; choosing `<` pre-fills the analyte's LOQ (`defaultValue={column.loq ?? ""}`) — the AC 4 one-click `<LOQ`. A boundary exactly equal to the stored LOQ bypasses the ambiguity rule (`lib/batches/mock.ts:3034`); anything else parses under the full rule.
- Qualifier: no extra input (the id rides a hidden field).
- Text: free text, server-trimmed, required, max 200 chars ("Qualitative text is limited to 200 characters.").
- No-result: required reason `Textarea` labelled "Reason (required — closes this cell out)".
- **Correcting an occupied cell:** the same dialog becomes a correction — description switches to "Correcting creates a new record with your reason — the original stays in the chain below.", a required "Correction reason (required)" `Textarea` appears, and the button reads "Save correction". The dialog pins `expectedCurrentRecordId` (the record it displayed, `""` for an empty cell); a concurrent write makes the server refuse: "This cell changed while you were looking — refresh and review the current value first." (`lib/batches/mock.ts:1282`). Entering into an occupied cell without a reason refuses: "This cell already has a value — a correction requires a reason."
- **Validation is server-side only** — there is no client-side pre-validation in the dialog; errors come back into a destructive Alert inside the dialog.

#### 2. Decimal input handling (manual path) — `lib/batches/parse.ts` (`parseNumericInput`)
- Accepts digits with **one** separator, comma or point, either accepted as the decimal separator; the canonical form keeps digits exactly as entered and normalises the separator to a point.
- Rejections (exact messages): empty → "Enter a value."; non-numeric characters → `"{raw}" is not a number — digits with one decimal separator only.`; two or more separators → `"{raw}" uses thousands notation — enter the plain number (e.g. 1234567.8).`; trailing separator → `"{raw}" ends in a separator — complete the number.`; the **ambiguity rule** — exactly 3 digits after the separator with a 1–3-digit non-zero integer part (e.g. `1,234` or `12.345`) → `"{raw}" is ambiguous (decimal or thousands?) — write {int}{dec} for the whole number, or add a decimal (e.g. {int}{sep}{dec}0).`
- The **import** path is different: the config *declares* the separator (`parseDeclaredNumeric`, `lib/batches/import-parse.ts:138`) — the other separator character appearing at all is rejected: `"{raw}" contains "{other}" but the configuration declares "{declared}" as the decimal separator — thousands separators are rejected.`; a repeated declared separator → `"{raw}" repeats the decimal separator — thousands notation is rejected.` So the app has **two documented decimal regimes**: ambiguity-rejecting dual-separator for manual/paste/worksheet, declared-separator for file imports. Consistent with each other in spirit (never guess), but testers should know they differ.

#### 3. Bulk paste (PasteDialog, `results-grid.tsx:277-443`)
- "Paste block…" opens a dialog: pick "First pasted line is row" (Select over grid rows, defaults to the first), paste into a mono `Textarea` (placeholder shows a tab-separated example `12.4\t0.82\t3.1` / `<0.010\t<0.005\tn.b.`).
- **Clipboard format:** tab-delimited rectangle, parsed client-side by `parseClipboardBlock` (`lib/batches/import-parse.ts:118`) with the same **RFC 4180 quote-aware scanner** as the CSV import — cells that Excel/Sheets quote on the clipboard (containing tabs/newlines/quotes) are unwrapped correctly, so paste from real Excel works. Structural errors surface immediately: "The pasted block could not be read: {scanner error}" (e.g. "Row {n}: content after a closing quote — the field is malformed.", "The file ends inside a quoted field — the export looks truncated."); an all-blank paste → "The pasted block contains no values." Interior blank lines are kept as rows (they shift the rectangle); only trailing blank lines are trimmed.
- The client maps **positions only** (which cell each token lands in — column order = grid column order); empty tokens are skipped; tokens falling past the grid edge are counted and surfaced: "⚠ {n} value(s) fall outside the grid (below the last row or past the last analyte column) and are NOT part of this paste — check the start row." All value parsing is server-side.
- **Preview:** server `previewBulk` (max 500 cells: "The pasted block is too large (max 500 cells)."). Preview table columns Row / Analyte / Input / Outcome; outcomes: green "✓ {display}", red "✗ {message}", amber "occupied — correct manually with a reason" (bulk flows never overwrite; AC 8). Cell interpretation (`interpretRawCell`, `lib/batches/mock.ts:3142`): leading `<`/`>` → censored; exact (case-insensitive) active-qualifier name → qualifier — unless it also `looksNumeric`, then rejected: `"{text}" matches the qualifier "{name}" but also reads as a number — rename the qualifier, then re-enter.`; otherwise numeric under the manual rules. Duplicate cell in the block → "Duplicate cell in the block."
- **Confirm:** only a one-use staging token travels; the server writes exactly the staged preview or refuses ("The preview has expired — run the preview again." / "The grid changed since the preview (a value was added or the qualifier list changed) — run the preview again." / "No accepted cells to write — fix the rejected ones and try again."). If the textarea or start row changes after previewing, the Confirm button disables with "⚠ The block or start row changed after this preview — preview again before confirming (the confirm writes exactly what was previewed)." Button label: "Confirm {n} accepted cell(s)". Rejected/occupied cells are simply not written.

#### 4. Worksheet upload + auto-read (WorksheetUpload in `batch-detail-client.tsx:466-487`; WorksheetReadDialog in `results-grid.tsx:446-513`)
- **Upload** (Files tab, open batch, `canWork`): file input `accept=".xlsx,.xls,.csv,.pdf"`, 5 MB cap ("Worksheets are limited to 5 MB in the mock."), empty-file guard ("Choose a file to upload."). Each upload is a new immutable version (sha256 recorded); uploading during review refuses: "Worksheets can only be uploaded while the batch is being worked — during review the record is closed (a set-back reopens it)."
- On upload the server immediately tries to read a **Results sheet** and returns a notice, shown inline: either `Results sheet detected: {n} readable value(s) — review and confirm the pending preview via Results ▸ "Read from worksheet…".` or a fallback such as "No readable Results sheet in the worksheet ({parse error}) — falling back to manual entry or paste." / "No readable Results sheet: no column matches this method's analytes — falling back to manual entry or paste." A missing/mismatching sheet is a notice, never a gate.
- **Read dialog:** button "Read worksheet v{n}" → server re-reads the latest version (`previewWorksheet`), returns the same preview-cell table as paste plus amber notices (e.g. "Ignored columns (no matching analyte): …", "{n} row(s) match no sample or QC code of this batch and were ignored."). A QC code carried by two batch entries makes the whole sheet unreadable by design: "No readable Results sheet mapping: QC code "{code}" is carried by two entries of this batch — enter those values manually (or per entry via paste), where the intended lot can be chosen." Confirm is token-pinned to the previewed worksheet **version** and outcome set — a replacement upload in the window refuses: "The worksheet was replaced after the preview — run the preview again." / "The worksheet or the grid changed since the preview — run the preview again."; all-occupied/rejected → "Nothing to write — every readable cell is occupied or rejected." Written records carry origin `worksheet` and the version number.

#### 5. Instrument import (ImportDialog, `import-dialog.tsx`; configs on `/batches/import-configs`)
- "Import file…" → dialog "Import into {batchId}"; description "File + configuration → preview → confirm. Nothing is written before you confirm; the original file is stored with its checksum and the applied mapping at the import event."
- Pick an **active** import configuration of the batch's lab (Select "{name} ({fileType})"; empty state "No active import configurations for this lab yet — a manager creates them under Batches ▸ Import configurations.") and a file (`accept=".csv,.txt,.xlsx"`, 5 MB cap "Import files are limited to 5 MB in the mock.", empty guard "Choose the export file.").
- **Accepted formats:** CSV (declared delimiter comma/semicolon/tab; strict RFC 4180 parser, BOM stripped; structural breakage fails loudly) and `.xlsx` (declared sheet name, matched case-insensitively; **string-typed cells only** — number/date/formula cells refuse the whole file naming up to 3 addresses: `Cell(s) A2, B3, … are stored by Excel as numbers/dates/formulas — their original notation cannot be read back. Export the sheet with text-formatted cells or as CSV.`). File/config mismatches refuse: "This configuration reads CSV, but the file looks like Excel — pick the matching configuration." / "This configuration reads Excel (.xlsx) — pick the matching configuration for CSV files." Missing sheet: `The workbook has no sheet named "{name}" — the configuration declares the sheet to read.`
- **Preview:** summary line "{fileName} · {n} rows · {n} matched samples · {n} QC · {n} unresolved · {n} conflict cell(s)"; destructive Alerts for **unit errors** (the factor-1000 guard): `Column "{header}": configured unit "{unit}" ≠ method unit "{unit}" — all its cells rejected (factor-1000 guard).`; amber notices (unmapped columns, analytes not on the method, QC row-count vs quantity discrepancies). Per row: physical row number, the raw ID cell, and a match label — matched sample id, "{code} (QC)", "{sampleId} — not in this batch" (red), "{code} — two QC entries share this code, map to the intended lot" (amber), or "no match in this batch" (amber). Per cell: analyte name + "{display} ✓", conflict "{display} ⟳" (amber, `title` shows the existing value) with a per-cell Replace checkbox, or "✗" with the rejection message as `title`.
- **Resolution:** unknown and ambiguous-QC rows offer a "Map to…" Select over all grid targets (QC options labelled with the frozen lot to keep same-code entries distinguishable) **or** a "…or skip with a reason" input; out-of-batch rows can **only** be skipped. Confirm stays disabled while any row is unresolved, with "blocked: {n} unresolved row(s) — map or skip with a reason".
- **Conflicts:** "{n} cell(s) already hold a value — default is **keep existing** (AC 7)." Checkbox "Replace all conflicts (or tick individual ⟳ cells above)"; any replacement requires "Replace reason (required — recorded on each superseded value)". Server: "Replacing existing values requires a reason (recorded on each superseded value)."
- **Confirm** is token-pinned; drift refusals: "The preview has expired — run the preview again.", "The import configuration changed after the preview — run the preview again.", "The batch composition changed after the preview — run the preview again.", "The batch's results changed after the preview — run the preview again." A confirm where nothing applies (all rows skipped/kept/rejected) **still stores the import event** (triage decision 12). The event is self-contained: file bytes + sha256 + frozen mapping + per-row outcomes (imported / skipped / rejected / kept-existing), listed on the Files tab.

#### 6. Spreadsheet-like grid editing
**No spreadsheet/grid editing environment exists in the code.** The results "grid" is a read-oriented table whose cells open a modal dialog per cell; there is no in-cell typing, no arrow/Tab/Enter cell navigation, no cell-level copy/paste, no row add/delete, and no undo/redo anywhere in the batches area. An "embedded worksheet environment" exists only as a story draft (`docs/story-draft-embedded-worksheet.md`, proposed US-D7) — it is planned, not built. Keyboard interaction today: standard form controls inside dialogs; the paste dialog's textarea accepts a tab-separated rectangle (that is the only spreadsheet-shaped input).

### 4.2 Jobs area

- No spreadsheet/grid editing environment exists anywhere in the jobs area; no bulk import into jobs exists. The only file upload in this area is the per-sample "Deviation evidence" attachment (accept `image/*,.pdf`, required field; server rejects empty files and files > 5 MB — messages in §5.2).
- Dates: all date entry uses the shared masked `DateInput` (`components/ui/date-input.tsx`): a text field displaying/accepting **dd-mm-yyyy** with progressive digit masking ("1307" → "13-07"), `inputMode="numeric"`, `maxLength=10`, placeholder `dd-mm-yyyy`; a hidden input posts the ISO `yyyy-mm-dd` value. Impossible dates (31-02-2026) round-trip-fail and set native validity `"Enter a valid date as dd-mm-yyyy."`, blocking submit; `aria-invalid` is set after blur. `DateTimeInput` pairs that with a native `type="time"` field and posts `yyyy-mm-ddThh:mm`.
- Decimal input: the only numeric field is sample Quantity — plain text input, placeholder `1.5`, validated **server-side only** against `/^\d+(\.\d+)?$/` (point separator, no comma, no sign). Error: `"Sample quantity must be a plain decimal number with a point (e.g. 1.5)."`
- Sample rows on the job form are repeatable card sections (client state serialized into a hidden `samplesJson` field) — add row via "+ Add sample", remove only unsaved rows. If a sample has no methods ticked, submit substitutes the job-level default methods into that sample's payload.
- Deadline is re-validated server-side (`dueDateError`, `lib/jobs/mock.ts`): must be empty or match `/^\d{4}-\d{2}-\d{2}$/` AND survive a UTC round-trip. Errors: `"The deadline must be a calendar date in yyyy-mm-dd form."` / `"The deadline must be a real calendar date (yyyy-mm-dd)."`

### 4.3 Masterdata, admin & settings area

- **No grid/spreadsheet editing and no file-import parsing exist in this area.** File inputs here are attachment uploads only (method template, calibration certificate, QC certificate) — bytes are stored with a SHA-256, never parsed.
- **Decimal inputs are plain text fields validated server-side as point-decimal strings.** Patterns: `DECIMAL_PATTERN = /^\d+(\.\d+)?$/` (methods LOQ, `lib/methods/mock.ts:54`; QC expected/tolerance, `lib/qc/mock.ts`), `SIGNED_DECIMAL = /^-?\d+(\.\d+)?$/` and `UNSIGNED_DECIMAL = /^\d+(\.\d+)?$/` (equipment check values/tolerances, `lib/equipment/decimal.ts:9-10`). A decimal **comma is rejected, never converted** (ADR-4); e.g. "The measured value must be a plain decimal number with a point (e.g. 100.001)." Tolerance pass/fail is computed with scaled BigInt comparison (`withinTolerance`, `lib/equipment/decimal.ts:38`) — floats never used. Consistent across methods/equipment/QC in this area.
- **Dates**: `DateInput` (`components/ui/date-input.tsx`) — a masked text field that displays/accepts `dd-mm-yyyy` (progressive auto-hyphenation while typing digits, `inputMode="numeric"`, placeholder "dd-mm-yyyy") and posts ISO `yyyy-mm-dd` via a hidden input. Impossible dates (31-02-2026) or partial input post "" and set browser validity message "Enter a valid date as dd-mm-yyyy." Used for calibration last/due dates and QC expiry. Numeric HTML inputs (interval months, warning days, min password length, etc.) are plain `type="number"` with client min/max mirrored by server range checks.
- **Identifier formats**: free-text token templates with a live client-side preview; the authoritative token validation is server-side (see §5.4, Settings forms → Identifiers).
- **Dynamic row editors** (client state serialized to hidden JSON inputs on submit): method steps + analytes (`stepsJson`/`analytesJson`, `method-form.tsx:76-77`), QC expected values (`expectedValuesJson`, `qc-client.tsx:165`), equipment method links (`linksJson`). Rows save only on the form's explicit Save/Create — no per-cell or per-row saving. No keyboard grid navigation, no copy/paste handling, no undo/redo.

### 4.4 Decimal and number handling app-wide

Three deliberate regimes, all storing canonical point-form decimal STRINGS (never floats — comparisons use scaled BigInt in `lib/equipment/decimal.ts` `withinTolerance`):

1. **Interactive result entry** (US-D4 grid, `lib/batches/parse.ts` `parseNumericInput`, used server-side and for grid pre-validation): accepts comma OR point as decimal separator; keeps digits exactly as entered ("0.010" stays "0.010"); rejects: non-numeric (`"…" is not a number — digits with one decimal separator only.`), multiple separators (`"…" uses thousands notation — enter the plain number (e.g. 1234567.8).`), trailing separator (`"…" ends in a separator — complete the number.`), and the ambiguity pattern — exactly 3 decimals with a 1–3-digit non-zero integer part — with: `"…" is ambiguous (decimal or thousands?) — write ${int}${dec} for the whole number, or add a decimal (e.g. ${int}${sep}${dec}0).` Exception (decision 10 Jul): a censored boundary exactly equal to the analyte's stored LOQ bypasses the ambiguity rule.
2. **File import** (US-D5, `lib/batches/import-parse.ts` `parseDeclaredNumeric`): the decimal separator is DECLARED in the import configuration; the other separator appearing at all rejects: `"…" contains "…" but the configuration declares "…" as the decimal separator — thousands separators are rejected.`; repeated declared separator rejects (`"…" repeats the decimal separator — thousands notation is rejected.`). Censored `<x`/`>x` prefixes parse the boundary the same way.
3. **Masterdata numeric fields** (method LOQ `lib/methods/mock.ts`, QC expected values/tolerances `lib/qc/mock.ts`, equipment check criteria & measured values `lib/equipment/mock.ts`): **point only**, regex `/^\d+(\.\d+)?$/` (signed variant `/^-?\d+(\.\d+)?$/` for measured/expected check values). Messages e.g. `The measured value must be a plain decimal number with a point (e.g. 100.001).`, `Analyte "…": the expected value must be a plain decimal number with a point.`

Consistency verdict: internally consistent per regime and documented as a design decision (comma tolerance only where analysts type bench results; strict point in masterdata; declared in imports). Display is canonical point-form everywhere — locale-aware display was explicitly decided OUT (triage decision 10, 17 Jul 2026). Testers should expect comma input to be **rejected** in masterdata forms but **accepted** in the results grid.

## 5. Forms and validation

### 5.1 Auth, setup & platform forms

All auth/shell forms follow the same pattern: React 19 `useActionState` server action, client `required` attributes, server-side string checks, errors rendered in a destructive `<Alert>` inside the form, submit button disabled while pending with label swap. No toasts anywhere in this area.

#### Login form (`app/(auth)/login/login-form.tsx` → `loginAction` in `app/(auth)/actions.ts`)
- Fields: `email` (type email, required, autoFocus, autoComplete email), `password` (type password, required, autoComplete current-password). No defaults.
- Server validation: both non-empty → else "Enter your email and password." Backend (`authApi.login`) outcomes → messages:
  - invalid: "Invalid email or password." (deliberately generic — must not reveal whether the email exists)
  - locked: "This account is locked after too many failed attempts. Reset your password to restore access, or contact your administrator."
  - org-suspended: "Access for your organisation is currently unavailable. Please contact your administrator." (neutral, no reason)
  - mfa_required → swaps to MFA card; success → session cookie set (TTL from org settings) + `redirect("/")`.
- Pending label: "Logging in…".

#### MFA form (same file → `verifyMfaAction`)
- Fields: hidden `mfaToken`; `code` — `inputMode="numeric"`, `pattern="[0-9]{6}"`, `maxLength=6`, required, autoFocus, autoComplete one-time-code (client-side pattern; server just passes the string to `authApi.verifyMfa`).
- Card copy: "Two-factor verification" / "Enter the 6-digit code from your authenticator app."
- Error: "That code is not valid. Try again." (mfaToken retained so the user can retry). Success: session + `redirect("/")`. Pending: "Verifying…".

#### Forgot-password form (`forgot-password-form.tsx` → `forgotPasswordAction`)
- Field: `email` (type email, required, autoFocus).
- Server: empty → "Enter your email address." Always returns info: "If an account exists for that address, a reset link has been sent." — the form is replaced by this alert + "Back to login" button. Pending: "Sending…".

#### Reset-password form (`reset-password-form.tsx` → `resetPasswordAction`)
- Fields: hidden `token` (from URL, may be empty string), `password` (type password, required, autoComplete new-password, autoFocus), `confirm` (same).
- Server validation order: (1) password policy via `passwordPolicyError` (`lib/auth/password.ts`) with LIVE org policy from `authApi.passwordPolicy()`:
  - length: `password.length < minPasswordLength` → "Password must be at least {minPasswordLength} characters."
  - complexity (when `requireComplexity`): fewer than 3 of the 4 classes lower/upper/digit/special → "Password must mix at least 3 of: lowercase, uppercase, digits, special characters."
  (2) `password !== confirm` → "Passwords do not match."
  (3) backend token check fails → "This reset link is invalid or has expired. Request a new one."
- Success: info alert "Your password has been reset. You can now log in." + "Go to login" button (no auto-redirect). Pending: "Resetting…".
- [NOTE] The mock backend's reset flow validates but does not actually change the stored password (documented mock limitation — see section 8).

#### First-lab setup form (`app/(app)/setup/setup-client.tsx` → `createFirstLabAction` in `app/(app)/setup/actions.ts`, validation in `lib/labs/mock.ts` `validateInput`)
- Fields: `name` (text, required, placeholder "e.g. Metals lab"), `code` (text, required, `maxLength=8`, auto-uppercased controlled input, placeholder "e.g. MET"), `description` (text, optional, label "Description / location (optional)").
- Server validation (authoritative, `lib/labs/mock.ts:39-54`): name non-empty → "Lab name is required."; code non-empty → "A short code is required (it is used in IDs and labels)."; trimmed+uppercased code length 2–8 → "The code must be 2–8 characters."; regex `^[A-Z0-9-]+$` → "The code may contain only letters, digits and hyphens."; uniqueness among the org's labs → "The code \"{CODE}\" is already used by another lab in this organisation."
- Success: `redirect("/")` (→ `/jobs`, the new lab auto-becomes the active lab). Pending: "Creating…".

#### Provision-organisation form (`app/platform/provision-dialog.tsx` → `provisionOrganisationAction`)
- Fields: `name` (required), `adminEmail` (type email, required). Server delegates to `platformApi.provisionOrganisation` (name/email/duplicate checks in `lib/platform/mock.ts` — exact messages not quoted here [UNVERIFIED]); on success `revalidatePath("/platform")`, dialog closes via action callback (`useTransition`, not `useActionState`). On error: destructive alert inside dialog.

#### Org status-change form (`app/platform/organisation-table.tsx` → suspend/reactivate/deactivate actions)
- Fields: hidden `orgId`; `reason` (Textarea, required client-side; server passes to `platformApi.*` which enforces it [messages in `lib/platform/mock.ts` — exact wording not quoted, UNVERIFIED]).
- Success: `revalidatePath("/platform")` + dialog closes (per-target close guard so an in-flight result can't close the wrong dialog). Errors: alert in dialog.

#### Support-access grant/revoke (`support-access-form.tsx` → `grantSupportAccessAction` / `revokeSupportAccessAction`)
- Grant fields: `duration` select (values "24", "72", "168"; default "72"), `allowAdmin` checkbox (unchecked default). Server: `ALLOWED_DURATIONS = [24, 72, 168]`, else "Choose a valid duration (24, 72 or 168 hours)." Success: `revalidatePath`, card flips to granted state (no toast).
- Revoke: no fields; destructive button; card flips back.

#### Open-support-session (platform table row form → `openSupportSessionAction`)
- Hidden `orgId` only. On success sets `lims_support` cookie (expiry = min(now+8h, grant expiry)) and `redirect("/")` into the customer environment with the banner on. Errors render in an alert **below the whole table**, not next to the row.

### 5.2 Jobs forms

All job forms are server-action forms (`useActionState`); errors return as a single destructive Alert above the submit button (no per-field server errors). Client `required` attributes give native browser blocking on the marked fields.

#### Job registration / edit form (`app/(app)/jobs/job-form.tsx` → `createJobAction`/`updateJobAction` in `app/(app)/jobs/actions.ts` → `lib/jobs/mock.ts`)
- Header fields: `customer` (text, required attr + server), `customerRef` (text, optional), `receivedAt` (DateTimeInput, required attr + server), `priority` (select: `Standard` (default) / `High` / `Urgent` — hardcoded options), `dueDate` (DateInput, optional), job-level `requestedMethodIds` (checkbox group of active org methods; empty allowed), `storageLocation` (text, optional), `notes` (textarea, optional).
- Per-sample fields (≥1 row): type (select of active sample types, no `required` attr — enforced server-side), description (text, server-required), customerSampleRef (optional), quantity (optional, pattern above), quantityUnit (optional), per-sample requestedMethodIds (checkboxes; falls back to job default), deviation checkbox → deviationType radio (`cosmetic`/`mismatch`) + deviationNote (optional text). Mismatch shows the hint `"A customer consultation will be required before this sample can be accepted."`
- Server validation messages (exact, from `lib/jobs/mock.ts`):
  - `"Only Admins and Lab managers can manage jobs."`
  - `"The customer name is required."`
  - `"The date and time of receipt are required."`
  - `"A job needs at least one sample."`
  - `"Requested methods must be active methods of the organisation."`
  - `"Each sample needs a valid sample type."`
  - `"Each sample needs a description."`
  - `"Sample quantity must be a plain decimal number with a point (e.g. 1.5)."`
  - `"Each sample's requested methods must be active methods of the organisation."`
  - `"A deviation must have a type (cosmetic, or does-not-match-description)."`
  - deadline messages quoted in §4.2
  - create only: `"The generated job number is already in use — check the identifier format and sequence-reset settings."`
  - edit only: `"Unknown sample in the submission — reload and try again."`; `"This job is voided (a closed record) and cannot be changed."`; `"Sample {id} is in open batch {batchId} for one of its requested methods — that method cannot be removed while the batch runs (void the batch or remove the sample from its composition first)."`
  - JSON parse failure: `"The form data could not be read — reload the page and try again."`
- On success: create redirects to `/jobs/{id}`; edit shows inline `"Saved."` alert and stays. Submit button shows `"Saving…"` while pending.
- Edit grandfathering: an existing sample's current type/methods stay valid even if deactivated; NEW references to inactive options are rejected. An edit can never remove a sample; samples omitted from the submission are retained untouched.

#### Acceptance-decision dialog (`setSampleAcceptanceAction`)
- Fields: radio `accepted` (default) / `accepted-with-reservation` / `rejected`; `reason` textarea (required attr, only rendered for reservation).
- Server messages: `"Unknown sample."`; `"Invalid acceptance decision."` (server whitelists the three values); `"This sample is already in processing — its acceptance decision can no longer be changed here."` (once the sample is in any batch); `"A reservation requires a reason (carried to the report)."`; `"This sample does not match its description — record a customer consultation before accepting it."`
- Success: dialog closes, page revalidates.

#### Consultation dialog (`recordConsultationAction`)
- Fields: `who` (required attr), `when` (DateInput, optional), `outcome` (textarea, required attr). Server: `"Record who was consulted and the outcome."` Success: dialog closes.

#### Evidence-attachment dialog (`addSampleAttachmentAction`)
- Field: `file` (file input, required attr, `accept="image/*,.pdf"` — note: accept is a UI filter only; the server checks size, not type). Server messages: `"Choose a file to upload."`; `"The uploaded file is empty."`; `"Attachments are limited to 5 MB in the mock."` Stored with SHA-256 over the bytes. Success: dialog closes. [UNVERIFIED] whether uploaded attachments are listed anywhere in the UI afterwards — no rendering of `sample.attachments` was found in the jobs pages.

#### Void dialogs (`voidJobAction` / `voidSampleAction`)
- Field: `reason` textarea (required attr + server). Server messages: `"This job is already voided."`; `"A reason is required to void a job."`; `"A reason is required to void a sample."`; `"Unknown sample."`; `"A job must keep at least one sample — void the whole job instead."`; batch guards: `"Sample {id} is in unfinished batch {batchId}. Remove it from the composition (while unlatched), record a no-result, or void the batch before voiding this job."` / `"This sample is in unfinished batch {batchId}. Remove it from the composition (while unlatched), record a no-result, or void the batch first."`
- Success: dialog closes; voided job page shows the reason banner.

#### Add-sample dialog (`addSampleAction`)
- Same per-sample fields/validation as the registration form (validated alone, never against stale job header state). Success: dialog closes.

### 5.3 Batches forms

All batch forms are React 19 `useActionState` forms posting to server actions in `app/(app)/batches/actions.ts`; validation is server-side in `lib/batches/mock.ts` unless noted. The standard pattern: on invalid input the dialog stays open and shows a destructive Alert with the server message; on success the dialog closes (a `useEffect` on `state.success` calls `onDone`) and the page data revalidates (`revalidatePath`). No toasts exist anywhere in this area. HTML `required` attributes provide the only client-side enforcement, marked below.

#### Create batch (`new-batch-client.tsx` → `createBatchAction` → `batchApi.createBatch`)
- Fields (all serialized into hidden inputs): `labId`, `methodId`, `sampleIdsJson`, `confirmJson`, `qcJson` (`[{materialId, quantity}]`). Visible controls: method Select, sample checkboxes, requested-only checkbox, QC checkboxes + number inputs (min 1 / max 99, client-coerced to 1 when out of range).
- Required: ≥1 sample (client: submit disabled; server: "A batch needs at least one sample."), a method, positions within capacity.
- Server rules and exact messages (`validateComposition`, `lib/batches/mock.ts:399`): ineligible sample → per-sample message from `sampleIneligible` [UNVERIFIED — exact wording not quoted]; non-requested sample without confirmation → "Sample {id} does not request this method — confirm adding the method to the sample first."; duplicate QC material → "A QC material can be added only once per batch — adjust its quantity instead."; QC not offered → "A selected QC material is not available for this method (inactive, expired, other lab, or no covered analyte)."; quantity → "QC quantity must be a whole number between 1 and 99."; QC-code collision → `Two QC materials in this composition share the code "{CODE}" — the working copy and import matching cannot tell them apart. Remove the held entry first, or pick a material with a distinct code.`; capacity → "This composition needs {n} positions but the method allows {max} (samples + QC count alike)." Context: "Choose an active lab." / "Choose an active method." / "The method belongs to another lab." Authorization: "Read-only users cannot create or edit batches." / "You can only create batches in your own lab(s)." / "Analysts may not create batches in this lab (per-lab setting, US-A7)." / "You are not cleared for this method."
- Success: server action `redirect(`/batches/${batchId}`)`.
- Malformed hidden JSON → "The composition could not be read — reload and try again." (action-level).

#### Edit composition (`batch-detail-client.tsx` EditCompositionDialog → `updateCompositionAction` → `batchApi.updateComposition`)
- Same fields/rules as create, plus: only open batches ("Only open batches can be edited."), composition must not be latched, held-QC grandfathering ("This QC material is no longer available (inactive or expired) — its entry can be kept, reduced or removed, but not increased."), keeping a voided member refuses (badge "voided — uncheck to remove" names the fix). Success: dialog closes.

#### Complete step (CompleteStepDialog → `completeStepAction` → `batchApi.completeStep`)
- Fields: hidden `batchId`, `expectedStepIndex` (concurrency token), `equipmentJson` (`[{typeId, equipmentId}]`); one Select per required equipment type.
- Required: a choice per required type (client: submit disabled). Server messages: "This batch changed while you were looking — refresh the page and try again." (stale step index); "Duplicate equipment type in the selection."; "The selected {type} is not a valid choice for this step."; "{name} ({assetId}) is Blocked — {reason}."; "The equipment selection does not match this step's required types — refresh and try again."; "A voided batch accepts no transitions."; "This batch has finished its steps — it is with review." Success: dialog closes; the final step's completion is additionally gated server-side on an attached completed worksheet [message quoted on the Files tab empty state].

#### Set back (SetBackDialog → `setBackAction` → `batchApi.setBackStep`)
- Fields: target step Select, reason Textarea (`required` client-side).
- Server: "A reason is required to set a batch back."; "Choose an earlier step to set the batch back to."; "A voided or completed batch accepts no transitions." Success: dialog closes.

#### Void batch (VoidBatchDialog → `voidBatchAction` → `batchApi.voidBatch`)
- Fields: reason Textarea (`required`). Server: "A reason is required to void a batch."; "This batch is already voided."; "A completed batch cannot be voided." Success: dialog closes; samples derive back to Received.

#### Assign (AssignDialog → `assignBatchAction` → `batchApi.assignBatch`)
- Fields: assignee Select (`""` = unassigned). Server: "A finished batch is not assigned — it is a closed record."; "Unknown or inactive user."; "{name} cannot be assigned: {reason the target cannot work the batch}". Success: dialog closes.

#### Claim / Release (inline forms) 
- Server: claim — "A finished batch is not claimed — it is a closed record."; "Already assigned to {name} — you can still work on it (open pool), or ask a manager to reassign."; release — "You can only release your own claim — managers reassign via Assign." Errors render as small inline destructive text next to the buttons.

#### Enter / correct result (CellDialog → `enterResultAction` → `batchApi.enterResult`)
- Fields: Type select (wire kinds `numeric|censored|qualifier|text|no-result` with hidden `qualifier` `<`/`>` or `qualifierId`), `raw` / `boundaryRaw` / `text` / `noResultReason`, `supersedeReason` (Textarea, `required` client-side only when correcting), hidden `expectedCurrentRecordId`.
- Validation (server, `validateResultInput` + `parseNumericInput` — messages quoted in §4.1 points 1–2): also "Unknown qualifier.", "The qualifier "{name}" is deactivated — pick an active one.", "A censored value uses < or >.", "Boundary: {numeric message}", "Enter the qualitative result text.", "Qualitative text is limited to 200 characters.", "A no-result requires a reason (it closes this cell out).", target checks "That sample is not in this batch." / "That QC entry is not in this batch." / "Unknown analyte for this batch's pinned method version."
- Success: dialog closes, grid revalidates. No optimistic update.

#### Paste block / worksheet read / import confirm — covered in §4.1 points 3–5 (two-step preview→token→confirm forms).

#### Review decisions (`review-panel.tsx`)
- **Valid** (ValidButton → `setValidityAction`): no fields; errors inline.
- **Reject** (RejectDialog → `setValidityAction`): reason Textarea (`required`). Server: "Rejecting requires a reason — it anchors the nonconforming-work record (epic E)."; "Only a cell's CURRENT value is decided — this record was superseded."; "Decisions are made during review — this batch is not awaiting review."
- **Validate all unflagged** (`validateAllAction`): server "No pending results — nothing to validate."
- **Close gap** (CloseGapDialog → `closeGapAction`): reason Textarea (`required`, placeholder "e.g. insufficient sample volume after rework"). Server: "Closing a gap as no-result requires a reason."; "This cell already has a value — only empty or rejected cells are closed as no-result."; "Gap closure applies to this batch's sample and QC cells."
- **Complete batch** (`completeBatchAction`): server "Only a batch awaiting review can be completed."; "Completion blocked: {blockers}."
- **Replace post-completion** (ReplaceDialog → `replaceResultAction`): same value inputs as CellDialog plus "Replacement reason (required, §7.8.8)" Textarea (`required`) and hidden `expectedCurrentRecordId`. Server: "A post-completion replacement requires a reason (§7.8.8)."; "Post-completion replacement applies to completed batches only."; "This cell holds no value to replace."; "This cell changed while you were looking — refresh and review the current value before replacing it."

#### Import configuration (ConfigDialog → `saveImportConfigAction` → `batchApi.saveImportConfig`)
- Fields: Name (`Input`, `required` client-side, default `""` or source), Lab (Select over the actor's active labs, default first), ID column (`Input`, `required`, default "Sample"), File type (Select csv|excel, default csv), Orientation (Select wide|long, default wide), Decimal separator (Select "Comma (12,4)"|"Point (12.4)", default comma), CSV delimiter (Select "Semicolon (;)"|"Comma (,)"|"Tab", default semicolon; shown only for CSV), Sheet name (`Input`, `required`, placeholder "e.g. Results", shown only for Excel; helper "The import reads exactly this sheet — never whatever happens to be first in tab order."). Wide: repeatable rows File column header / Analyte / Unit + "no unit" checkbox (checking disables the unit input by setting it null) + "Remove row" icon button + "+ Add column". Long: Analyte column (default "Element"), Value column (default "Result"), repeatable per-analyte unit rows + "+ Add analyte unit".
- Server rules with exact messages (`validateConfigInput`, `lib/batches/mock.ts:2462`): "The configuration needs a name."; "Choose the lab this configuration belongs to."; "Name the sheet to read — Excel imports never trust tab order."; "Declare the decimal separator (ADR-4: declared, never auto-detected)."; "Name the column that carries the sample/QC ID."; wide — "Map at least one analyte column.", "Every mapped column needs its file header.", "Every mapped column needs an analyte name.", `Column "{h}": enter a unit or mark it explicitly as "no unit".`, `Column "{h}" is mapped twice.`, `Analyte "{a}" is mapped from two different columns — map it once.`, `Column "{h}" is both the ID column and an analyte column — choose one role.`; long — "Name the analyte column (long orientation).", "Name the value column (long orientation).", "The ID, analyte and value columns must be three different columns.", "Every unit row needs an analyte name.", `Analyte "{a}" has two unit declarations.`
- Authorization: "Only Admins and Lab managers manage import configurations." / "You can only manage import configurations in your own lab(s)."
- Success: dialog closes, list revalidates. Edits append "field: old → new" audit events per changed field (`describeConfigChanges`).

#### Import configuration status (StatusDialog → `setImportConfigStatusAction`)
- Reason Textarea (`required`). Server: "A reason is required to change the configuration's status." Success: dialog closes.

#### Worksheet upload (WorksheetUpload → `uploadWorksheetAction`)
- File input (`accept=".xlsx,.xls,.csv,.pdf"`). Action-level: "Choose a file to upload."; "Worksheets are limited to 5 MB in the mock." Server: "The uploaded file is empty."; review-time refusal quoted in §4.1 point 4. Success: inline notice with the auto-read outcome (no dialog).

### 5.4 Masterdata, admin & settings forms

#### Method create/edit (`app/(app)/methods/method-form.tsx` → `createMethodAction`/`updateMethodAction` in `app/(app)/methods/actions.ts` → `lib/methods/mock.ts`)
- Fields: name (text, required*, default ""), code (text, required*, `maxLength={12}` client-only, uppercase styling, default ""), labId (Select, default: current lab or first offered), description (Textarea, optional), accredited (checkbox, default false; label "Accredited method (drives report marking, epic F)"), maxSamplesPerBatch (number, client `min={1}`, default 20), steps[] (ordered rows: name text + per-step "Requires equipment:" checkboxes of org equipment types; reorder ↑/↓ buttons; remove ✕; "+ Add step"), analytes[] (rows: name, unit or "no unit" checkbox, decimals number client `min={0} max={6}` default 2, LOQ text optional; remove ✕; "+ Add analyte").
- *"required" attributes are on the client inputs; every rule below is enforced server-side in `validateInput` (`lib/methods/mock.ts:56`):
  - "Method name is required." / "A method code is required."
  - "Choose the lab this method belongs to." / "Methods cannot be moved to an inactive lab." (a method already in a deactivated lab stays editable in place)
  - "Duplicate step ids in the submission — reload the page and try again." (same for analyte ids)
  - Code unique per org, case-insensitive: `The code "{CODE}" is already used by another method in this organisation.` **No server-side length limit on the code — the 12-char cap is client-only.**
  - "A method needs at least one process step." / "Process steps cannot be empty."
  - Step equipment types: `Step "{name}": unknown equipment type in the requirement.` / `Step "{name}": the equipment type "{type}" is inactive — pick an active type.` (held types are grandfathered)
  - "A method needs at least one analyte." / "Analyte names cannot be empty." / `Analyte "{name}": enter a unit or mark it explicitly as "no unit".` / `Analyte "{name}": reporting precision must be 0–6 decimals.` (integer) / `Analyte "{name}": the reporting limit must be a plain decimal number with a point (e.g. 0.010).` (`/^\d+(\.\d+)?$/`)
  - "Max samples per batch must be at least 1." (integer, no upper bound)
  - Malformed hidden JSON: "The form data could not be read — reload the page and try again."
- On invalid: destructive Alert above the submit button with the server message; form state preserved (steps/analytes are controlled client state).
- On success: create → redirect to `/methods/{id}`; update → inline Alert "Saved[ — new version {n} created]." Editing a method `usedByBatches` appends a new version (no-op saves create no version); an unused method's v1 is edited in place.

#### Method status (`MethodStatusForm`, `method-detail-client.tsx` → `setMethodStatusAction`)
- Fields: hidden methodId/status; reason (Textarea, required client + server).
- Server: "A reason is required to change the method's status." Same-status is a silent success.
- Success: dialog closes; page revalidates.

#### Template upload (`TemplateSection`, `method-detail-client.tsx` → `replaceTemplateAction`)
- Fields: templateFile (file, `accept=".xlsx,.xls,.csv"` — client filter only), hasResultsSheet (checkbox "Template includes the standard Results sheet (enables auto-read at worksheet upload)").
- Action-level: "Choose a template file to upload." Server (`lib/methods/mock.ts:294`): "The uploaded file is empty." / "Template files are limited to 5 MB in the mock." No server-side extension/content validation.
- Success: inline Alert "Template uploaded[ — method version {n} created]." (new method version only when used by batches).

#### Equipment create/edit (`EquipmentDialog` / `EditEquipmentDialog` → `createEquipmentAction`/`updateEquipmentAction` → `lib/equipment/mock.ts`)
- Fields: name (required), assetId "Equipment ID" (required, `maxLength={32}`, placeholder "e.g. BAL-003"; **readOnly in edit**), typeId (Select, active types + grandfathered current), labId (Select), manufacturer/model/serialNumber/location (all "(optional)"), description (Textarea optional).
- Server rules (`validateEquipmentInput`, `lib/equipment/mock.ts:255`):
  - "The equipment name is required."
  - assetId regex `/^[A-Za-z0-9][A-Za-z0-9._/-]{1,31}$/` → "The equipment ID must be 2–32 characters (letters, digits, . _ / -)."
  - Unique org-wide across active AND inactive, case-insensitive: `The equipment ID "{id}" is already used in this organisation.`
  - "Choose an equipment type." / "This equipment type is inactive — pick an active type." (grandfathered)
  - "Choose the lab this equipment belongs to." / "Equipment cannot be assigned to an inactive lab." (grandfathered)
  - Edit only: any assetId change → "The equipment ID is fixed once created — it names the physical asset and is never changed or reissued. For a wrong tag: deactivate this record and create a new one."
- On error the submitted text fields are echoed back (`values`) so React 19's form reset doesn't wipe them. On success: dialog closes, list revalidates. The four optional fields are deliberately optional (triage decision 4, logged).

#### Calibration (`CalibrationDialog` → `updateCalibrationAction`)
- Fields: intervalMonths (number, client min 1 max 120, empty allowed), lastDate (DateInput), dueDate (DateInput, "manual"; helper "Leave empty to derive it.").
- Server: "The calibration interval must be 1–120 whole months." / "The last calibration date must be a valid date (yyyy-mm-dd)." / "The last calibration date cannot be in the future." / "The due date must be a valid date (yyyy-mm-dd)." / "The due date cannot be before the last calibration date." / clearing tracked calibration: "Calibration tracking cannot be removed once recorded — enter the renewed calibration instead."
- Due date = manual override, else last + interval (month-clamped). Success closes the dialog; changes land in equipment History as "interval: … → …; last: … → …; due: … → … (set manually)".

#### Check type define/edit (`CheckTypeDialog` → `addCheckTypeAction`/`updateCheckTypeAction`)
- Fields: ctName (required), frequency (Select per-use/daily/weekly, default daily), criterion kind radios (numeric default / manual), numeric: expectedValue, unit + noUnit checkbox, toleranceKind (±/%), toleranceValue; manual: criterionDescription (Textarea, placeholder "What makes this check a pass?").
- Server (`validateCheckTypeInput`, `lib/equipment/mock.ts:301`): "The check type needs a name." / `An active check type named "{name}" already exists here.` / "Choose a check frequency." / "The expected value must be a plain decimal number with a point." (signed allowed) / "The tolerance must be a plain decimal number ≥ 0." / "The tolerance must be absolute (±) or a percentage." / `Enter a unit or mark the criterion explicitly as "no unit".` / "Describe the acceptance criterion (what makes this check a pass)." / "Invalid acceptance criterion."
- Edit guard (triage decision 2): re-scheduling that would clear an active block → `This change would clear an active block ({reason}). Log a passing entry or set the equipment out of service first.`

#### Check-type retire/reactivate (`CheckTypeStatusDialog` → `setCheckTypeStatusAction`)
- Reason Textarea required. Server: "A reason is required to change the check type's status." Retire guard (triage decision 2): `This check type cannot be retired while it blocks the equipment ({reason}). Log a passing entry or set the equipment out of service first.` Reactivation name-clash: `An active check type named "{name}" already exists here.`

#### Log check (`LogCheckDialog` → `logCheckAction`)
- Fields: checkTypeId (Select of active types), measuredValue (text, mono, placeholder "e.g. 100.001"; required iff numeric criterion), result radios Pass/Fail (manual criterion only, required), notes (optional).
- Server: role gate "Read-only users cannot log checks." / lab gate "Checks can only be logged for equipment in your own lab(s)." (admins/support exempt) / "Inactive equipment cannot receive new checks — reactivate it first." / "This check type has been retired — checks can no longer be logged against it." / numeric: "This check has a numeric criterion — enter the measured value; pass/fail is computed." + "The measured value must be a plain decimal number with a point (e.g. 100.001)." + "The acceptance criterion could not be evaluated — check the check type's configuration."; manual: "Choose pass or fail." + optional measured value must still be decimal. For numeric criteria any submitted manual pass/fail choice is ignored — the result is computed and flagged `computed` in the log.

#### Out of service / return / equipment status (`OutOfServiceDialog`, `ReturnToServiceForm`, `StatusDialog`)
- Out of service: reason required — "A reason is required to take equipment out of service." / "This equipment is already out of service."
- Return: note optional — "This equipment is not out of service." on mismatch.
- Status: reason required — "A reason is required to change the equipment's status."

#### Equipment type manage (create/rename/status, in `ManageTypesDialog` → `createTypeAction`/`renameTypeAction`/`setTypeStatusAction`)
- Admin-only server-side: "Only Admins manage the equipment-type list."
- Create: "The type name cannot be empty." / `A type named "{name}" already exists (reactivate it instead of adding a duplicate).` Rename: same empty check / `A type named "{name}" already exists.` Status: "A reason is required to change the type's status."

#### Method links (`LinksDialog` → `saveLinksAction`)
- Checkbox selection serialized to `linksJson`. Parse failure: "The link selection could not be read — reload the page and try again." Server: "Unknown method in the link selection."

#### QC material create/edit/new-lot (`MaterialDialog` in `qc-client.tsx` → `createQcMaterialAction`/`updateQcMaterialAction` → `lib/qc/mock.ts`)
- Fields: name (required), code (required, `maxLength={12}` client-only, label "Code (matched at instrument import)"), type (Select Blank/Control standard/CRM (certified), default control-standard), labId (Select), supplier (optional), lotNumber (optional for Blank, else required server-side), expiryDate (DateInput; optional for Blank), description (optional), certificate (file, create mode only, `accept=".pdf,image/*"`, "optional — recommended for CRMs"), expectedValues[] rows (analyte name, unit/"no unit", value, ±/%, tolerance — hidden entirely for Blank), status radios + conditional statusReason (edit only).
- Server rules (`lib/qc/mock.ts:86`): "The material name is required." / "A short code is required (matched on instrument-import rows)." / "Invalid QC material type." / "Choose the lab this material belongs to." / "QC materials cannot be assigned to an inactive lab." / code unique per lab among ACTIVE materials, case-insensitive: `The code "{CODE}" is already used by another active QC material in this lab.` (an inactive record doesn't contend) / non-blank: "A lot number is required for this material type.", "A valid expiry date (yyyy-mm-dd) is required for this material type.", "A Control standard or CRM needs at least one analyte with an expected value." / blank: "A Blank has no numeric targets — it is checked against the method's reporting limit.", "The expiry date is not a valid date (yyyy-mm-dd)." / per expected value: "Duplicate analyte ids in the submission.", "Analyte names cannot be empty.", `Analyte "{name}": enter a unit or mark it explicitly as "no unit".`, `…the expected value must be a plain decimal number with a point.`, `…the tolerance must be a plain decimal number ≥ 0.`, `…tolerance must be absolute (±) or a percentage.`, `Analyte "{name}" appears more than once.` (name+unit key)
- Status change: "A reason is required to change the material's status."; reactivation code clash: `Another active material in this lab already uses the code "{code}".`
- Certificate: "Choose a file to upload." / "The uploaded file is empty." / "Certificates are limited to 5 MB in the mock." Create-time cert failure after material creation: `The material was created, but the certificate upload failed ({message}). Close this dialog and add the certificate via Edit.`
- On invalid: destructive Alert; text fields echoed back. On success: dialog closes, list revalidates; cert upload inside Edit shows "Certificate uploaded."

#### Lab create/edit (`labs-client.tsx` → `createLabAction`/`updateLabAction` → `lib/labs/mock.ts`)
- Fields: name (required), code (required, client `maxLength={8}`, uppercase styling), description (optional), status radios + conditional statusReason (edit).
- Server: "Lab name is required." / "A short code is required (it is used in IDs and labels)." / "The code must be 2–8 characters." / "The code may contain only letters, digits and hyphens." / `The code "{CODE}" is already used by another lab in this organisation.` / `A lab named "{name}" already exists in this organisation.` / "A reason is required to change the lab's status." / "This is the organisation's last active lab — it cannot be deactivated."
- Status is validated BEFORE field edits commit (guard call), so a rejected deactivation never half-saves.

#### User create/edit (`users-client.tsx` → `createUserAction`/`updateUserAction` → `lib/users/mock.ts`)
- Fields: name (required), email (type=email, required), role (Select; lab managers only see Analyst/Read-only), labs (checkboxes of active in-scope labs), clearances (checkboxes, Analyst only), status radios (edit; no reason field).
- Server: "Full name is required." / "Enter a valid email address." (rule is just `includes("@")`) / "Invalid role." (whitelist) / lab-manager violations: "Lab managers cannot manage Admins or other Lab managers.", "Lab managers can only assign the Analyst or Read-only role.", "Lab managers can only assign users to their own lab(s).", "Lab managers can only manage users in their own lab(s)." / lab checks: `Unknown lab "{name}".`, "Users cannot be newly assigned to an inactive lab." / "Assign the user to at least one lab." (**skipped for role admin — admins are org-wide, 13 Jul 2026**) / email uniqueness platform-wide: "An account with this email address already exists." / self-edit: "You cannot change your own role, labs or clearances here." / last-admin: "This is the organisation's last active Admin — the role cannot be changed and the account cannot be deactivated."
- Merge semantics: labs and clearances outside the actor's scope survive saves untouched; clearances go dormant (not destroyed) when the role leaves Analyst. Email rename re-points open batch assignments.
- Success: dialog closes. Reset/unlock: inline info Alerts "Password reset sent to {email}." / "Account unlocked."

#### Settings forms (`settings-client.tsx` → `app/(app)/settings/actions.ts` → `lib/settings/mock.ts`)
- **Security**: minPasswordLength (client min 8 max 128), lockoutThreshold (3–10), sessionTimeoutMinutes (5–480), requireComplexity, requireMfa. Server (whole integers): "{label} must be a whole number between {min} and {max}." with labels "Minimum password length" (8–128), "Lockout threshold" (3–10), "Session timeout" (5–480).
- **Identifiers**: jobFormat/sampleFormat/batchFormat (free text, mono), sequenceReset radios, jobLabel. Server rules (`lib/settings/mock.ts:62`), each with exact message:
  - exactly one `{SEQ:0…}` per template → `{label} must contain exactly one {SEQ:000} token.`
  - `{JOB}` only in sample format → `{label}: the {JOB} token is only available in the sample number format.`
  - "Sequence reset must be never, yearly or monthly."
  - sample format must contain `{JOB}` → "Sample number format must contain the {JOB} token — sample sequences restart per job, so the job number is what keeps sample IDs unique."
  - `{LAB}` forbidden in job format ("…jobs are organisation-wide (one order may span several labs).") and sample format ("…samples follow the organisation-wide job number."); required in batch format ("Batch number format must contain the {LAB} token — batch sequences run per lab…").
  - monthly reset needs `{MM}` ("…otherwise numbers repeat every month."), yearly needs `{YY}`/`{YYYY}` ("…otherwise numbers repeat every year.") — sample format exempt when it carries `{JOB}`.
  - "The job label cannot be empty."
- **Lists** (sampleTypes / resultQualifiers): "List entries cannot be empty." / `"{name}" appears more than once in the list.` (case-insensitive, across renames + new) / qualifiers only (triage decision 8): names matching `/^[<>]/` or `/^-?[0-9.,]+$/` → `"{name}" reads as a number (or censored value) — a qualifier with this name would hijack numeric instrument text. Pick a non-numeric name.` Whole edit validated before any mutation.
- **Barcode**: widthMm 20–150, heightMm 10–100 (same inRange message shape, labels "Label width"/"Label height"). Symbology hard-coded `"code128"` in the action.
- **Equipment**: calibrationWarningDays 1–365 (label "Calibration warning window").
- **Lab settings**: two checkboxes; server "Unknown lab." if labId is stale.
- All settings saves: inline "Saved." on success; destructive Alert on error; every actual change is appended to `settingsEvents` with actor + old → new values (no-op saves log nothing).

## 6. UI states

Global finding first: **there are no `loading.tsx`, `error.tsx` or `not-found.tsx` files anywhere in `app/`** — the application has zero route-level loading skeletons and zero error boundaries. Loading feedback exists only as disabled submit buttons with pending labels ("Saving…", "Creating…", …); an unhandled server error falls through to the Next.js default error screen, and unknown IDs render the framework's default 404 via `notFound()`. **No toast/notification system exists anywhere in the app** — success feedback is a redirect, a closing dialog, or an inline "Saved." text.

### 6.1 Shell, auth, setup & platform

There are **no `loading.tsx`, `error.tsx` or `not-found.tsx` files anywhere in `app/`** (verified by glob over the whole app directory). Loading feedback exists only as per-form pending labels; an unhandled server error yields the default Next.js error overlay/500. This applies to every route in this area.

#### `/login`
- Empty: n/a. Loading: button pending labels ("Logging in…"/"Verifying…") + disabled submit. Error: destructive Alert inline in the card. Success: hard redirect to `/`, no toast.

#### `/forgot-password`, `/reset-password`
- Loading: pending labels ("Sending…"/"Resetting…"). Error: inline Alert. Success: form replaced by info Alert + navigation button. Empty: n/a.

#### `/setup`
- Loading: "Creating…". Error: inline Alert. Success: redirect to `/` → `/jobs`. Empty: n/a (the page IS the empty-org state).

#### `/platform`
- Empty (zero organisations): MISSING — the table renders with headers and an empty body; no empty-state row or message.
- Loading: server-rendered; only per-dialog pending labels ("Provisioning…"/"Saving…") and disabled "Open session" while pending. No page-level loading state.
- Error: dialog errors inline; "Open session" errors in an Alert under the table. No error boundary.
- Success: table revalidates in place; dialogs close; no toast/confirmation message.

#### `/settings/support-access`
- Empty: the "No active grant" card is the designed empty state. Loading: pending labels ("Granting…"/"Revoking…"). Error: inline Alert. Success: card content flips (grant box ↔ form); no toast.

#### App shell (all `(app)` pages)
- The lab-reset amber banner is the only shell-level notice: "Your active lab was reset to {name}." + OK. SupportBanner when a support session is active. No global toast/notification system exists.

### 6.2 Jobs & label printing

#### /jobs
- Empty: single table row `"No {job}s match your filters."` — used both when the org has zero jobs and when filters exclude everything (no separate "no data yet" state). The Getting-started card partially covers first-run for admins.
- Loading: MISSING — no `loading.tsx` anywhere in the jobs area; server-rendered page, no skeletons.
- Error: MISSING — no `error.tsx`; a thrown server error falls through to the framework default.
- Success feedback: n/a (read-only page).

#### /jobs/new
- Empty: methods section shows `"No active methods yet."`; missing sample types produce the alert quoted above.
- Loading: submit button `"Saving…"` + disabled while pending. No page-level loading state.
- Error: inline destructive Alert with the exact server message; native browser blocking for `required`/date-mask violations.
- Success: redirect to the new job's detail page (no toast).

#### /jobs/[id]
- Empty: Batches tab `"No batches contain this {job}'s samples yet."`; History renders an empty table with headers if there are no events (no message row — MISSING empty-state text); omitted Details fields simply don't render.
- Loading: per-dialog pending labels (`"Saving…"`, `"Voiding…"`, `"Uploading…"`, `"Adding…"`); no page-level loading state.
- Error: unknown id → framework 404 (`notFound()`, no custom not-found page found). Dialog errors inline as destructive Alerts.
- Success: dialogs close on success; page data revalidates. No toast/confirmation text.

#### /jobs/[id]/edit
- Same pattern as /jobs/new; success shows inline `"Saved."` alert, page does not redirect.

#### /labels/[id]
- Empty: unreachable — zero labels redirects to `/jobs/[id]` server-side.
- Loading: MISSING. Error: unencodable ID renders the red `"ID not encodable as Code 128"` placeholder per label. Success: n/a (print is a browser action).

### 6.3 Batches

#### /batches
- Empty: yes — table row "No batches in this lab yet." (truly no rows) vs "No batches match the current filters." (filtered to zero).
- Loading: **MISSING** at route level (no `loading.tsx`); per-button pending states only ("…" on Claim).
- Error: **MISSING** (no error boundary); Claim errors inline.
- Success: implicit — data revalidates; no toast/confirmation.

#### /batches/new
- Empty: yes — "No active methods in this lab."; "No eligible samples[ requesting this method] — samples must be accepted, not voided, and not already in an open batch of this method."; "No QC materials cover this method's analytes (active, unexpired, same lab)."
- Loading: submit-button pending "Creating…" only. Route-level **MISSING**.
- Error: destructive Alert above the submit with the server message.
- Success: redirect to the new batch's detail page (that page opening is the confirmation).

#### /batches/[id]
- Empty: per-tab empty states quoted in §3.3 (no QC, no worksheet, no imports, "No working copy generated."); Results fallback "The results grid could not be loaded."
- Loading: dialog submit buttons show "Saving…" / "Uploading…" / "Parsing…" / "Reading…" / "Writing…" / "Importing…" / "…". Route-level **MISSING**.
- Error: unknown batch → Next.js default 404 via `notFound()` (no custom not-found page); action errors → destructive Alerts inside the dialogs; claim/release/validity errors inline.
- Success: dialogs close on success; header/grid re-render from revalidated data. Only the worksheet upload gives a textual success notice (the auto-read outcome). No toasts.

#### /batches/import-configs
- Empty: yes — "No import configurations in this lab yet." (see §12.5 for staleness).
- Loading: button pending "Saving…". Route-level **MISSING**.
- Error: destructive Alert inside the dialogs.
- Success: dialog closes; list revalidates; no toast.

### 6.4 Masterdata, admin & settings

(General pattern for this whole area: server components render synchronously — there are **no route-level `loading.tsx`/`error.tsx` files and no skeletons/spinners anywhere in scope**; the only "loading" feedback is the disabled submit button relabelled "Saving…"/"Creating…"/"Uploading…" during a pending action. Success = dialog close or inline "Saved."/Alert; errors = inline destructive Alert with the server message. No toasts.)

#### /methods
- Empty: table row "No methods in your lab(s) yet." — implemented. Loading: MISSING. Error: MISSING (unhandled render error = default Next error). Success: n/a (read view).
#### /methods/new & /methods/[id]
- Empty (no template): Alert "No template uploaded yet — batches cannot be created for this method until one exists (epic D)." Loading: submit-button pending text only. Error: inline Alert. Success: redirect (create) / "Saved…" Alert (edit).
#### /quality/equipment
- Empty: "No equipment in your lab(s) yet." vs filtered-empty: "No equipment matches the current filters." — both implemented (distinct messages). Loading: MISSING. Error: MISSING.
#### /quality/equipment/[id]
- Empty sub-states: "No routine checks defined. A defined scheduled check becomes required — the equipment blocks until it is performed and passes." / "No checks logged yet." / "Not linked to any method yet. The link is what drives equipment-gating in epic D." / "No certificate on file." / (links dialog) "No active methods in this equipment's lab yet." History table has NO empty-row branch — a new record still has a "created" event so it never renders empty in practice, but a zero-event render would show a headerless empty table [edge, UNVERIFIED in practice]. Loading: pending buttons only. Error: per-dialog Alerts.
#### /quality/qc-materials
- Empty: "No QC materials in your lab(s) yet." Loading: MISSING. Error: dialog Alerts only.
#### /admin/labs
- Empty: **MISSING** — no empty-table branch in `labs-client.tsx`; with zero labs the table renders headers only. (Unreachable for a normally provisioned org going through /setup, but the state is not handled.)
#### /admin/users
- Empty: **MISSING** — no empty-row branch in `users-client.tsx` (the acting admin always lists themself, so effectively unreachable). Success feedback: dialog close; info Alerts for reset/unlock.
#### /admin/roles
- Static content; no empty/loading/error states apply.
#### /settings
- Empty: lists render with just the "Add new…" input when empty (no explicit empty message); Lab settings section silently renders nothing (`return null`) when the org has no active labs — **MISSING empty message**. Loading: "Saving…" buttons. Error/Success: per-card Alert / "Saved." text.

## 7. Roles and permissions in the frontend

### 7.1 The roles system

**Roles** (`lib/auth/types.ts`): `"admin" | "lab-manager" | "analyst" | "read-only" | "platform-admin"`. The first four are organisation roles (`OrgRole` in `lib/permissions.ts`); `platform-admin` is vendor staff with `orgId: null`.

**Capability matrix** (`lib/permissions.ts`, `CAPABILITY_ROWS` — also rendered verbatim as the read-only reference page at `/admin/roles`): view-data (all four), create-jobs (admin, lab-manager), create-batches (admin, lab-manager, analyst = "per-lab-setting" — the lab's `analystsMayCreateBatches` toggle, default off), enter-data/advance steps (admin, lab-manager, analyst = "cleared-only" — per-method clearances on the user record), review-approve (admin, lab-manager), manage-methods-equipment-qc (admin, lab-manager), assign-clearances (admin, lab-manager), manage-users (admin only), org-settings (admin only). `can(role, capability)` answers the blanket matrix; conditional values resolve at point of use. UI label strings: Admin, Lab manager, Analyst, Read-only, "Vendor support" (`ROLE_LABELS`).

**How the current role is determined:** login (`app/(auth)/actions.ts` → `authApi.login`) issues the `lims_session` httpOnly cookie (base64url JSON `{user: {email, name, organisation, role}, expiresAt, ttlMs}`). Every protected page/server action calls `resolveOrgContext()` (`lib/auth/context.ts`), which re-validates against the live store each request (`authApi.validateSession`) and **trusts the live record, not the cookie snapshot** — a role change, deactivation or lock takes effect on the victim's next request, redirecting dead sessions to `/session-expired` (a route handler that deletes the cookie, then sends to /login). Route-level gating in `proxy.ts` (root): unauthenticated → only `/login`, `/forgot-password`, `/reset-password`; authenticated users are bounced OFF those pages; non-platform-admins are bounced off `/platform`; platform-admins are locked INTO `/platform` unless a support session cookie is present. The sliding TTL (per-org `sessionTimeoutMinutes`, resolved at login by `lib/auth/ttl.ts`, clamped 5–480 min; platform staff fixed 30 min) is re-issued on every request.

**Support/vendor sessions:** a platform admin enters a customer org only through a consent grant (`org.supportGrant`, granted by the customer under `/settings/support-access` with `allowAdmin` and expiry; liveness derived from timestamps). Opening a session sets the `lims_support` cookie; `resolveOrgContext` re-checks the LIVE grant each request and maps rights via `effectiveOrgRole`: read-only grant → the `read-only` capability row, admin grant → `admin`. A revoked/expired grant kills the context immediately.

**Switching roles for testing:** log out and log in as another seeded account (demo seed covers all five roles), or — in either seed — create users of any role via /admin/users as an admin (new users get the demo password) and log in as them. There is **no in-app role-switcher or impersonation feature**. In the clean seed the only path is: log in as vendor@lims.dev → provision an org → log in as its admin → create the rest.

### 7.2 Role behavior in the shell, auth & platform pages

Roles in frontend code (`lib/permissions.ts`): org roles `admin | lab-manager | analyst | read-only` (`OrgRole`), plus `platform-admin` (vendor). Effective role during a support session (`effectiveOrgRole`): admin grant → `admin`, read-only grant → `read-only`; platform-admin without session → `null`.

Observed role-dependent behavior in this area:
- `proxy.ts`: `session.user.role === "platform-admin"` gates `/platform` both ways (see §2.1).
- `app/(app)/page.tsx`: `ctx.role === null` → `/platform`; `ctx.role === "admin"` + zero labs → `/setup`.
- `app/(app)/setup/*`: `ctx.role !== "admin" || !ctx.orgId` → redirect `/` (page and action both).
- Sidebar visibility per `visibleNav` (see §2.5): Admin group = admin (4 items) / lab-manager (Users only) / analyst, read-only (none).
- Lab switcher: admins get "All labs" + every active lab (`allowAll`); lab-scoped roles get assigned active labs; support sessions get the static "All labs" chip; `setActiveLabAction` rejects `ALL_LABS` for non-admins server-side.
- `requireOrgAdmin` (`settings/support-access/actions.ts`): live `role !== "admin"` → redirect `/`; this deliberately excludes vendor support sessions from grant management.
- Header shows the role label next to the user name: "{name} ({Admin|Lab manager|Analyst|Read-only|Vendor support})".
- Role switching for testing: log in as a different demo account (see demo-accounts box). No in-UI role switcher exists.

### 7.3 Role behavior in the jobs area

- `admin`, `lab-manager`: full manage — see "+ New {job}", "Edit"/"Void" buttons, all sample dialogs. Server re-checks with `"Only Admins and Lab managers can manage jobs."`
- `analyst`: read-only on jobs (no manage buttons) but CAN print labels (per-row 🖨 and "Print all" render; `/labels` allows).
- `read-only`: sees lists/detail, no manage buttons, no print buttons; `/labels/[id]` server-redirects them away.
- Support sessions (`actor.isSupport`): org-wide visibility; header shows "All labs (support session)". A support session's effective role comes from the grant (see §7.1): an admin grant maps to `admin` and passes the manage gate; a read-only grant maps to `read-only` and does not.
- Lab scoping: non-admin roles only see jobs routing work to their labs (server-side `canSee`); admins get an "All labs" view.
- The admin-only Getting-started checklist renders solely for `role === "admin" && !isSupport`.

### 7.4 Role behavior in the batches area

Role logic the frontend applies in this area (all mirrored server-side; the client flags are presentation only):
- **View batches:** every org role incl. read-only; `resolveBatchActor` only requires an org context (`app/(app)/batches/actions.ts:44-54`). List scope = active lab; admins get an org-wide "All labs" view (`activeLab === null` → `listBatches(actor, null)`).
- **Create batch / edit composition** (`canComposeBatch`, `lib/batches/mock.ts:76`): read-only never ("Read-only users cannot create or edit batches."); admin/support always; lab-manager within own labs; analyst only when the lab's `analystsMayCreateBatches` toggle is on **and** the user is cleared for the method (clearances read live). The `/batches` "+ New batch" button uses the coarse client copy: `actor.role === "admin" || actor.role === "lab-manager" || (actor.role === "analyst" && activeLab !== null && (mockDb.labs.get(activeLab.id)?.analystsMayCreateBatches ?? false))` (`app/(app)/batches/page.tsx:48-53`) — note it does not pre-check clearance; the New-batch page/server does.
- **Work a batch** — complete step, enter results, upload worksheet, claim (`canWorkBatch`, `lib/batches/mock.ts:104`): read-only never; admin/support always; lab-manager within own labs; analyst if cleared for the batch's method.
- **Manage** — set-back, void, assign (`canManageBatch`; client `canManage` in `app/(app)/batches/[id]/page.tsx:34-36`): admin or lab-manager, lab-scoped for managers. "Only Admins and Lab managers can do this."
- **Review** — validity flips, gap closure, complete batch, post-completion replace (`canReviewBatch`, `lib/batches/mock.ts:2269`): manage rights **plus**, when the lab's `reviewerMustDiffer` toggle is on, the actor must not have completed steps or entered bench results on the batch (reviewer-capacity records marked `reviewAct` don't count). UI hides decision buttons when `view.canReview` is false and shows the reason in an Alert.
- **Claim/release:** claim offered when unassigned + `canWork`; release only to the current assignee ("You can only release your own claim — managers reassign via Assign.").
- **Import configurations:** page redirects unless admin/lab-manager; list under the masterdata exemption — `listImportConfigs(actor, null)` filters by `canSeeLab`, lab-managers see their labs, admins all labs.
- **Read-only role:** sees everything (lists, detail, grids, review panel read-only, history) but every mutating entry point is hidden or refused server-side.
- **Support sessions** (`actor.isSupport`): org-wide visibility, no active lab → cannot create batches (`/batches/new` redirects since batch creation "registers no bench work" without a lab context).

### 7.5 Role behavior in masterdata, admin & settings

Roles in scope (from `lib/permissions.ts:8`): `admin`, `lab-manager`, `analyst`, `read-only`, plus `platform-admin` (vendor) which maps through support sessions to admin or read-only capabilities (`effectiveOrgRole`, `lib/permissions.ts:99`).

- **/methods**: view = all roles (lab-scoped for non-admins via lab-name membership). "+ New method" button and form editability: `actor.role === "admin" || actor.role === "lab-manager"`; detail-page `canManage` additionally requires the lab-manager's labs to include the method's lab (`app/(app)/methods/[id]/page.tsx:30`). Server re-checks: "Lab managers can only manage methods in their own lab(s)." / "Only Admins and Lab managers can manage methods."
- **/quality/equipment**: view all roles; `canManage` (create/edit/calibration/check types/links/OOS/status) = admin or lab-manager (server: "Only Admins and Lab managers can manage equipment."; lab-scoped for managers); `canManageTypes` = admin only ("Only Admins manage the equipment-type list."); `canLog` = every role except read-only (`actor.role !== "read-only"`, server: "Read-only users cannot log checks." + own-lab check with admin/support exemption).
- **/quality/qc-materials**: view all roles; manage = admin/lab-manager ("Only Admins and Lab managers can manage QC materials.").
- **/admin/labs**, **/admin/roles**, **/settings**: admin only (redirect to `/`).
- **/admin/users**: admin + lab-manager. Lab managers: see only users sharing one of their labs; role options limited to Analyst/Read-only; lab checkboxes limited to their labs; cannot touch admins/other lab managers (server messages quoted in §5.4).
- Support sessions (`isSupport`) get org-wide lab visibility in the lab-option filters (`actor.isSupport ||` branches) and pass the same role matrix.

## 8. Mock backend behavior

**Where:** `lib/mock-db.ts` exports `mockDb`, a plain object of `Map`s cached on `globalThis` under the versioned key `` `__limsMockDbV30r${SEED_RESET}${CLEAN_SEED ? "Clean" : ""}` `` (evaluates to `__limsMockDbV30r1` or `__limsMockDbV30r1Clean`). Every `lib/<area>/mock.ts` mutates these maps directly. All `lib/<area>/index.ts` adapter switches are hard-wired to the mock implementation **except** `lib/auth/index.ts`, which picks `supabaseAuthApi` when `NEXT_PUBLIC_SUPABASE_URL` is set. There are **no artificial delays and no simulated random errors** anywhere in `lib/` (verified by grep: no `setTimeout`/`sleep`/`Math.random`). All Api methods are `async` only by contract; they resolve immediately.

**Persistence semantics:**
- Across client-side navigation and full browser refresh: **data persists** — the store lives in the Next.js dev-server process, not in the browser. Nothing is stored client-side except three cookies (session, support session, active lab).
- Across dev-server restart: **everything resets** to the seed.
- Across HMR / long dev sessions: persists (globalThis cache). `getOrgSettings()` backfills store shapes from older HMR generations.
- Caveat: the middleware (`proxy.ts`) runs in a worker with its **own** globalThis and deliberately never reads the store (see `lib/auth/ttl.ts` comment) — it is cookie-only.
- Deliberate reset paths: bump `SEED_RESET` in `lib/mock-db.ts`, or restart the dev server, or flip `LIMS_CLEAN_SEED` (each mode caches its own store instance).

**Genuinely simulated:** effectively everything the UI offers mutates the store for real — create/edit/deactivate/void across orgs, labs, users, methods (with real versioning), QC materials, equipment (+checks/calibration), jobs/samples, batches (steps, results, review, completion), settings, import configs, imports (file bytes kept in memory, real SHA-256 over the uploaded bytes), attachments (checksummed, bytes for working copies kept in `mockDb.batchFiles`). Append-only `events[]` lists exist on every entity family. Sequence counters (`mockDb.sequences`) run per org/lab/period — IDs are genuinely minted once and never reissued.

**Mock-only shortcuts (things that only appear to work like production):**
- Session cookie `lims_session` is base64url JSON, **unsigned/forgeable** (`lib/auth/session.ts` says "NOT tamper-proof"); live per-request re-validation (`authApi.validateSession` via `lib/auth/context.ts` `resolveOrgContext`) is the backstop.
- One shared password for every account: `DEMO_PASSWORD = "LabDemo2026!!"` (`lib/mock-db.ts` line 841). New users created via US-A6 and admins created by provisioning also get this password preset (`lib/platform/mock.ts` ~line 108: "mock: password preset to the demo password").
- MFA accepts exactly one code: `DEMO_MFA_CODE = "123456"` (`lib/auth/mock.ts`).
- Password reset: the "email" is a `console.log` line on the dev server with a link containing the static token `demo-reset-token`; `resetPassword` **does not change any password** — it only clears `locked`/`failedAttempts` on ALL users (mock simplification, commented in `lib/auth/mock.ts` lines 119-125). It does enforce the full password policy on the submitted new password.
- Seeded attachments/templates carry the placeholder checksum string `"seed-checksum-no-real-file-0000000000000000000000000000000000000000"`; files uploaded through the UI get real SHA-256.

**Supabase adapter status [PARTIAL, parked]:** `lib/auth/supabase.ts` fully implements the `AuthApi` contract (login, TOTP MFA via factor/challenge, recovery-token reset, live `validateSession` via `auth.getUser()`), but: (a) it is inactive because the env var is commented out; (b) the DB role check constraint only allows `('admin','user')` vs the app's five roles — `DB_ROLE_MAP` degrades unknown values to `"read-only"`, maps `"user"` → `"analyst"`; (c) `validateSession` returns `labs: null` (no lab assignments in the auth schema) so lab data falls back to the domain mock; (d) domain data (labs/jobs/batches) stays in-memory mock even with Supabase auth on — the Supabase org must be named exactly like a mock org for context to resolve (README). Only auth would be real; nothing else.

**Seed modes.**

*CLEAN seed (`LIMS_CLEAN_SEED=1`, currently active in the committed `.env.local`):* empty platform — no organisations, no domain data, no sequences. One account:

| Email | Role | Org | Labs | Password | MFA |
|---|---|---|---|---|---|
| vendor@lims.dev | platform-admin | LIMS Platform (none) | — | LabDemo2026!! | no |

Everything else must be provisioned through the vendor console (`/platform`); the provisioned org's first admin can then log in with `LabDemo2026!!`.

*DEMO seed (default when the flag is unset):* 3 organisations — `Demo Lab` (active, subscription active), `Lab Alpha BV` (active, trial, has a standing support grant: read-only, expires 48 h after server start), `OldCust BV` (suspended, "Non-payment (mock seed)"). Accounts:

| Email | Name | Role | Org | Labs | Password | MFA |
|---|---|---|---|---|---|---|
| admin@demolab.nl | Alex Admin | admin | Demo Lab | (org-wide; assignments list carries Metals, Water but admins ignore it) | LabDemo2026!! | no |
| labmanager@demolab.nl | Lisa Manager | lab-manager | Demo Lab | Metals | LabDemo2026!! | no |
| analyst@demolab.nl | Sam Analyst | analyst | Demo Lab | Metals (cleared for methods m-ph, m-icpms) | LabDemo2026!! | **yes — code 123456** |
| readonly@demolab.nl | Rob Reader | read-only | Demo Lab | Metals (never logged in → "—" in users list) | LabDemo2026!! | no |
| user@oldcust.nl | Olga Oldcust | read-only | OldCust BV (suspended → login shows the org-suspended message) | Main lab | LabDemo2026!! | no |
| vendor@lims.dev | Vera Vendor | platform-admin | LIMS Platform | — | LabDemo2026!! | no |

Demo domain data (all `org-demolab` unless noted): labs Metals/MET (active, `hasActiveWork: true` so deactivation is blocked), Water/WAT (active, deactivatable), External site/EXT (inactive, reason "Site closed for renovation (mock seed)"); Lab Alpha and OldCust each have one "Main lab". Org lists (demo org only — fresh orgs start empty): sample types Water/Soil/Sludge, result qualifiers `n.b.`. Methods: `m-ph` "pH" M-001 (Metals, accredited, used-by-batches → edit creates v2), `m-icpms` "Metals by ICP-MS" M-014 (Metals, accredited, 5 steps with equipment-type requirements on steps 1 and 3, analytes Pb/Cd/Zn with LOQs "0.010"/"0.005"/—), `m-cond` "Conductivity" M-002 (Water, unused → edits stay v1; its required pH-meter type has zero selectable items → demos the hard stop), `m-cl` "Chloride by IC" M-021 (inactive, no template → visible warning). QC materials (all Metals lab): CS1 "Metals mix 1" control standard (Pb/Cd/Zn expectations), BLK blank (no expectations), CRM1 "River sediment" NIST CRM (mg/kg units deliberately non-matching, has certificate), CS2 "Cal check standard" (expiry within 30 days → expires-soon flag), and an INACTIVE previous lot also coded CS1 (grandfathering/code-collision demo). Equipment: BAL-001 Available (checked today; check history demos an append-only fail→re-check correction), ICP-01 Due soon (calibration due in 20 days, manual due date), BAL-002 Blocked (calibration expired + check overdue), PH-03 Blocked (last check failed, Water lab), OVN-01 Blocked (out of service; grandfathered inactive type "Muffle furnace"), BAL-000 inactive. Jobs: MET26-00001 (3 samples: accepted / accepted-with-reservation / mismatch-deviation awaiting consultation), MET26-00002 (not started), MET26-00003 (in progress, overdue), MET26-00004 (completed), MET26-00005 (voided). Batches: METB26-0001 completed (full review demo, 4 valid results incl. a censored `<0.005`), METB26-0002 open at step 3, claimed by analyst, with a supersede-chain demo (12.9 → 12.4 "transcription error, worksheet says 12.4"). Import configs: "ICP-OES export (wide)" (CSV, semicolon delimiter, comma decimal) and "ICP-OES export (long)" (CSV, comma delimiter, point decimal). Platform audit log seeds one entry (OldCust suspension). Equipment check/calibration dates are computed relative to server start (`isoDay(offset)`), so the availability demos stay correct on any date.

## 9. Compliance-related UI

**There is no global audit-log page in the frontend.** Append-only event stores exist on every entity family in the mock (section 8), but the only read UIs are per-entity History views: the job History tab (`/jobs/[id]`), the batch History tab (`/batches/[id]`) and the equipment History tab (`/quality/equipment/[id]`), plus the equipment check log. Each is a read-only table (When / Who / What pattern) with **no filtering, search, pagination or export**. Method, user, QC-material, equipment-type, settings and platform events are recorded but have no UI anywhere (deferred to epic E per code comments). The subsections below list the compliance-relevant UI per area: mandatory reason fields, blocked deletions, immutability messaging, and integrity checks beyond field validation.

### 9.1 Shell, auth & platform

- Org suspend/reactivate/deactivate: mandatory `reason` (required textarea), dialog copy states "A reason is required and recorded."; deactivation copy asserts never-delete: "The organisation and all its data are retained (nothing is ever deleted)…". Actions attribute the platform actor (`actorEmail` from live session) — `app/platform/actions.ts`.
- Support access is consent-based and customer-controlled: vendor can only "Open session" while a customer grant is live; customer copy promises audit visibility ("Active sessions and every support action appear in your audit log."); grant management is unreachable via support sessions; ending/opening sessions goes through `platformApi` so grant state stays server-side. Support cookie expiry is capped at the grant's expiry.
- Persistent support banner while a session is active (US-A2 AC 9 marker).
- Session lifecycle: live re-validation on every request (`resolveOrgContext`) so lockouts/demotions/suspensions bite immediately; login lockout after failed attempts surfaces the "account is locked" message; suspended-org login is neutral by design.
- Enumeration safety: identical forgot-password response either way; generic invalid-credentials message.
- Lab-reset banner makes a silent context change visible ("working-in-the-wrong-lab is a compliance risk" — comment in `app/(app)/layout.tsx`).

### 9.2 Jobs area

- Immutable identifiers: job number and sample IDs are minted server-side on registration, shown as "example" preview beforehand, labelled `"fixed; never reissued"` in edit mode; edit ignores/refuses foreign sample ids; IDs never editable in any form.
- Never-delete: no delete anywhere; jobs/samples are voided with a mandatory reason via dialogs whose text states the policy (`"Voided records are retained for the audit trail, never deleted. A reason is required."`). Voided records stay visible (50% opacity, `voided` badge, reason banner). A voided job is write-frozen server-side; a voided sample cannot be re-voided (original reason preserved).
- Mandatory reasons: void job, void sample, acceptance-with-reservation (`"Reservation reason (carried to the report)"`).
- Append-only history: the History tab renders the job's stored `events[]` (registration, edits as `field: "before" → "after"` diffs, acceptance flips `before → after`, consultations, evidence with truncated SHA-256, voids) — read-only, no filtering.
- Gating: rejected/mismatch handling per §7.4.3 — mismatch samples cannot be accepted without a recorded consultation (client warning + server block); acceptance is frozen once the sample enters processing; voiding is blocked while a sample sits in an unfinished batch; a job must keep ≥1 live sample.
- Evidence files: stored with SHA-256 checksum computed server-side over the actual bytes; 5 MB cap.
- Voided jobs cannot print labels (server redirect, "a closed record must not get physical labels").

### 9.3 Batches area

- **Append-only history:** the History tab renders `batch.events` directly (sorted client-side, newest first) — no edit/delete affordances anywhere. Card title literally "History (append-only)".
- **Supersede-with-reason:** corrections ("Correction reason (required)"), import replacements ("Replace reason (required — recorded on each superseded value)"), post-completion replacements ("Replacement reason (required, §7.8.8)"); every chain dialog shows "— corrects the previous: {reason}" per superseded record and states "nothing is ever overwritten".
- **Validity decisions as audited acts:** each ✓/✗ is its own form/action; rejected badges carry the reason as `title`; chain entries show validity, reason, and `validitySetBy`.
- **One-way composition latch:** messaging "Composition is locked (work has been recorded) — a set-back never reopens it." and the edit dialog's own description; the first recorded result flips the latch server-side (`appendRecord`, `lib/batches/mock.ts:3118`).
- **Completion gate:** blockers enumerate empty cells, unresolved rejected cells, and undecided results; "Complete batch" stays disabled until the list is empty; completion is described as final in the UI copy.
- **§7.8.8 amendment flag:** destructive badge in the header, Alert in the review panel, per-record `⚠ §7.8.8` markers in chains.
- **Working copy integrity:** file name + sha256 prefix + generation timestamp displayed; download via a dedicated route.
- **Worksheet versioning:** every upload a new version with sha256, uploader, timestamp; "Replacing uploads a new version — nothing is ever overwritten."
- **Import event self-containment:** Files-tab copy quoted in §3.3; per-row outcomes including "kept existing"; an all-skipped confirm still records the event.
- **Void semantics:** mandatory reason; voided banner explains record retention; voided samples/batches badge everywhere rather than disappearing.
- **Overdue:** a server-computed flag (deadline passed, batch unfinished — `isOverdue`, `lib/batches/mock.ts:124`), displayed as `⚠`/amber, explicitly never a status.
- **Never-guess numeric policy:** grid footer copy plus the two rejection-based parsers (see §4.1 point 2); the qualifier/number ambiguity guard on paste/worksheet cells.
- **Tenant isolation surface:** rejected preview cells never echo other-org data (`rowLabelFor` / `previewEntries` comments and behavior, `lib/batches/mock.ts:3170, 3282`).

### 9.4 Masterdata, admin & settings

- **Method versioning**: editing a used method never mutates — a new version is appended; banner warns before save; old versions "retained for traceability" counter; template replacement on a used method also mints a new method version pinning the template version; no-op saves suppressed. Versions immutable via deep copies (`lib/methods/mock.ts:317-333`).
- **Deactivate-with-reason everywhere**: methods, equipment, equipment types, check types (retire), QC materials, labs — all require a non-empty reason server-side, with dialog copy stating "deactivated, never deleted". **Exception: user status changes have no reason field** (dialog copy still says never deleted). Nothing in this area has a delete button.
- **No generic unblock**: equipment availability is derived live; the list footer states there is "deliberately no manual unblock". Triage guards actively refuse the two disguised unblocks: retiring a blocking check type and re-scheduling one out of blocking (exact messages in §5.4). Clearing a recorded calibration due date is refused. "No calibration recorded" itself blocks: "No calibration recorded — record a calibration (or its due date) first".
- **Immutable identifiers**: equipment assetId readOnly in UI + server refusal; lab code changes never rewrite issued identifiers (dialog copy); identifier format changes "affect newly generated IDs only".
- **Append-only histories**: equipment History tab (When/Who/What, read-only, newest-first, no filter/search); check log (read-only table with explicit copy "Entries are never edited or removed…"); method/user/type/settings events are recorded in the stores (`events[]`, `settingsEvents`) but **have no read UI in this area except the equipment History tab** (deferred to epic E per code comments).
- **Attributability**: every mutation resolves the actor from the server session; check entries stamp performer + server time ("The performer and time are recorded automatically.").
- **Computed pass/fail**: numeric check criteria compute the result via exact BigInt decimal comparison; the UI states it "cannot be overridden" and the server ignores any submitted manual choice; computed results carry a visible "computed" marker.
- **Data-integrity guards beyond field validation**: qualifier-name hijack guard (numeric-looking qualifier names refused); QC code uniqueness among active materials per lab (import-matching integrity); duplicate-id rejection on tampered hidden-JSON posts; validate-before-mutate ordering on lab/QC status+edit combos; last-active-lab and last-active-admin protections.
- **Certificates/templates**: stored with SHA-256 shown in the UI (methods template card: "every version is immutable and carries a SHA-256 checksum, so it is provable which template a batch was calculated with").

## 10. Accessibility basics

### 10.1 App-wide survey

- **Primitives:** 13 of the 21 `components/ui/*` files build on `@base-ui/react` (dialog, select, checkbox, dropdown-menu, tabs, tooltip, sheet, separator, etc. — verified by grep). Dialogs use Base UI's Root/Portal/Backdrop/Popup, so Escape-to-close, backdrop dismiss and focus trap/restore come from the library. All dialogs get an explicit close (X) button (`components/ui/dialog.tsx` renders `XIcon` inside `DialogClose`).
- **Interactive elements are overwhelmingly real `<button>`/`<Link>` elements.** Sortable job-list column headers are real `<button>`s (`app/(app)/jobs/job-overview.tsx` 199-218). Results-grid cells are real `<button>`s with disabled states and title tooltips (`app/(app)/batches/[id]/results-grid.tsx` ~606).
- **Clickable table rows (mouse-only pattern):** `<TableRow onClick={() => router.push(...)}>` used for row navigation in: `app/(app)/jobs/job-overview.tsx` (~224 — mitigated: the first cell contains a real `<Link>` as the keyboard/AT path, with an explicit code comment saying no `role="link"` on purpose), `app/(app)/batches/batches-client.tsx` (~249 — **no in-cell link**; batch rows are unreachable by keyboard), `app/(app)/quality/equipment/equipment-client.tsx` (~424 — **no in-cell link**, same problem). No `onKeyDown` handlers exist anywhere in `app/` or `components/` (grep), and no `tabIndex` outside the sidebar primitive — so row-click navigation without an in-cell anchor is keyboard-inaccessible.
- **aria-labels:** present and reasonably systematic on icon-only and unlabeled controls — 60+ occurrences across ~20 files (heaviest: methods/method-form.tsx 9, qc-client.tsx 6, job-overview.tsx 6, batches-client.tsx 5). Filter `Select`s carry `aria-label="Filter by …"`. `components/theme-toggle.tsx` and `components/lab-switcher.tsx` each carry one.
- **Other keyboard notes:** the results grid has NO arrow-key/Tab cell navigation (cells are individual buttons; entry happens in a per-cell dialog — see §4.1). No skip links. No custom focus management in app code (left to Base UI). `role=` attributes are essentially absent in app code (one comment explains why, jobs list).

### 10.2 Shell, auth & platform observations

- All interactive elements in this area are real `<button>`/`<a>` (shadcn `Button`, Next `Link`); no clickable divs found.
- Icon-only buttons have labels: `SidebarTrigger aria-label="Toggle sidebar"`, theme toggle `aria-label="Toggle dark mode"`, lab switcher trigger `aria-label="Switch lab"`.
- Labels: every form input in this area has a `<Label htmlFor>`; MFA input uses `inputMode="numeric"` + `autoComplete="one-time-code"`.
- Dialogs are shadcn/Base-UI (`components/ui/dialog.tsx`): Escape/overlay close and focus trap come from the library [library-provided — see §10.1]; the platform status dialog blocks closing while pending via `onOpenChange` guard.
- AutoFocus is set on the primary field of every auth/setup/dialog form.
- Sidebar tooltips on collapsed items via the sidebar component's `tooltip` prop.
- Nothing keyboard-hostile found in this area.

### 10.3 Jobs area observations

- Table rows on /jobs are clickable `<TableRow onClick>` (mouse convenience) — deliberately no `role="link"`; the real anchor in the first cell is the keyboard/AT path (documented in a code comment). Sort headers are real `<button>`s.
- Icon-only controls carry aria-labels: per-sample print `aria-label="Print label for {id}"`, sample-row remove `aria-label="Remove sample"`; filter selects have aria-labels ("Filter by status" etc.); DateInput halves of DateTimeInput have `aria-label="Date"` / `"Time"`.
- "🖨 Print all" relies on the emoji + text; the emoji has no text alternative but the visible text suffices.
- Dialogs are the shared `components/ui/dialog.tsx` (Base UI); they cannot be dismissed while a submit is pending (`onOpenChange` guarded by `pending`). Escape/focus-trap behavior comes from the library defaults [library-provided — see §10.1].
- Deviation radios and acceptance radios are native `<input type="radio">` inside `<label>`s. The deviation-note tooltip (`title` on the ⚠ span) is mouse-only.
- Barcode SVGs expose `role="img"` + `aria-label`.

### 10.4 Batches area observations

- Result-grid and review-panel cells are real `<button type="button">` elements — keyboard reachable.
- **Queue rows navigate via `onClick` on `<TableRow>`** (`batches-client.tsx:248-252`) — not links, not focusable; keyboard users cannot open a batch from the list. The inline Claim form stops propagation to avoid row navigation.
- aria-labels present on: filter selects ("Filter by step/status/method/assignee"), search input, QC add/include checkboxes (`Add {code}`, `Include {code}`, `{code} quantity`), paste textarea ("Pasted block"), import-dialog per-row controls (`Map row {n}`, `Skip reason for row {n}`, `Replace {analyte} in row {n}`), config-dialog row inputs and the icon-only "Remove row" button (`aria-label="Remove row"`).
- Equipment/step selects in CompleteStepDialog have `aria-label={"Select {typeName}"}`.
- Dialogs are the shared `components/ui/dialog.tsx` wrapper (Base UI); Escape/overlay close goes through `onOpenChange`, which every dialog wires — but most guard it with `!pending`, so Escape is ignored mid-submit. Focus trap/restore behavior comes from the library [library-provided — see §10.1].
- Several dialogs set `autoFocus` on the primary input (cell value, config name, replace value).
- Status-meaning color (green/amber/red) is mostly paired with symbols (✓ ✗ ⚠ ⟳) or words; the review ✓/✗ buttons are icon-only with `title` but no `aria-label`.

### 10.5 Masterdata, admin & settings observations

- Interactive elements are real `<button>`/`<a>`/form controls throughout (shadcn/Base UI). **Exception: table rows as click targets** — equipment list rows use `onClick` + `cursor-pointer` with no `role`/`tabIndex`/key handler (`equipment-client.tsx:423-427`), so the detail page is unreachable by keyboard from the table (no other link in the row). Method rows use a real `<Link>` instead — inconsistent patterns for the same idiom.
- Icon-only buttons carry aria-labels: "Move step up/down", "Remove step", "Remove analyte", "Analyte name/unit", "Expected value", "Tolerance kind/value", "Search equipment", "Filter by lab/state", `Rename {type}` etc. Roles-page icons have aria-labels "allowed"/"not allowed".
- Dialogs are Base-UI/shadcn `Dialog` components (Escape close and focus trap come from the library); several forms set `autoFocus` on the first field (method status reason, lab name, QC name, OOS reason). Close is suppressed while an action is pending (`onOpenChange={(o) => !o && !pending && onDone()}`).
- Labels are consistently associated via `htmlFor`/`id`; radio groups use `<fieldset>`/`<legend>`.
- Keyboard-hostile spots: clickable equipment rows (above); the Settings list rows rely on visual adjacency (rename input + active checkbox) without a per-row group label — the rename inputs have **no aria-label or label** (`settings-client.tsx:220`), announced only by value.

## 11. Design decisions and deviations

Primary sources: `CLAUDE.md`, `docs/decision-log.md` (69 lines, 60+ dated entries), `docs/PROJECT_STATE.md`, `docs/open-decisions.md`, `docs/notion-amendments-2026-07-13.md` (Decisions A–G), `docs/story-draft-embedded-worksheet.md`, `docs/architecture-kaders.md`, `docs/working-agreements.md`.

**Approach-changing decisions recorded during development (dated, one line each):**
- 3 Jul 2026 — Mock-first: entire frontend built against in-memory mocks behind per-area swap-point interfaces; real backend plugs in later (decision-log).
- 3 Jul 2026 — Supabase Auth chosen (server-proxied), Supabase Postgres intended; both currently parked pending the partner backend spec (decision-log; PROJECT_STATE).
- 3 Jul 2026 — Server-rendered App Router with client islands, not a SPA; session-bound org routing (no org in URLs).
- 3–4 Jul 2026 — Derived-never-stored pattern adopted everywhere (sample status, equipment availability, batch phase); append-only measurement rows + one validity column; decimal strings + BigInt comparisons, floats never.
- 4 Jul 2026 — Own strict RFC-4180 CSV parser + exceljs raw-text extraction; import event = self-contained snapshot (file + SHA-256 + frozen mapping + outcomes).
- 4 Jul 2026 — Masterdata lists exempt from active-lab scoping (the switcher scopes WORK screens only).
- 6–13 Jul 2026 — Successive review passes hardened every preview→confirm flow to a one-token "apply exactly what was previewed or refuse" contract.
- 13 Jul 2026 — **Jobs are organisation-wide** (one order = one number; `{LAB}` forbidden in job/sample formats, required in batch format); batches stay lab-scoped. Changed the whole identifier model mid-build; seed jobs keep historical MET-prefixed numbers.
- 13 Jul 2026 — **Admins are org-wide**: no lab assignments; switcher = "All labs" (default) + every active lab. Superseded a same-day creator-auto-assign decision.
- 13 Jul 2026 — **No default lab at provisioning** (reverses the 1 Jul seeded-"MAIN" call); fresh admin lands on first-run `/setup`. **Org-specific lists start EMPTY** (sample types, qualifiers, equipment types). Derived "Getting started" checklist instead of a wizard.
- 13 Jul 2026 — dd-mm-yyyy masked date entry component replaces native date inputs (ISO on the wire).
- 17 Jul 2026 — Session TTL wired to org `sessionTimeoutMinutes` (embedded at login); password complexity = 3-of-4 classes via one shared helper; every masterdata family got append-only `events[]`; permanent Vitest invariant suite.
- 17 Jul 2026 — **All 16 parked review decisions triaged in one sitting** (docs/open-decisions.md has the full list + commit map; all built by 21 Jul). Highlights testers will meet: no-calibration blocks equipment; voiding is refused while a sample sits in an unfinished batch; rejected result cells block batch completion (with a reviewer closure route); QC cells count in the completeness gate; xlsx import accepts only string-typed cells and a declared sheet name; number-like qualifier names are refused; an all-skipped import still stores its event; QC-code collisions are blocked at composition.
- 17 Jul 2026 — **Data-entry redesign decided (NOT built):** data entry is to move from uploaded/downloaded Excel files to an EMBEDDED in-app Excel-like worksheet (ADR-4 phase 2, candidate engine Univer) so cell-level changes are attributable — recorded in decision-log line 1 and drafted as proposed story US-D7 in `docs/story-draft-embedded-worksheet.md`. **The current code still implements the file-based flows (template upload, working-copy download, completed-worksheet upload + auto-read); no spreadsheet component exists in the codebase.** Instrument-file import (US-D5) stays file-based by design even after the redesign.

**Code vs older docs (code is current in every case):**
- `docs/stories/` + `docs/00-INDEX.md` are frozen Notion exports of 1–2 Jul 2026 and predate the 13 Jul decisions: story text still says jobs/sequences are per-lab, admins need lab assignments, a default "MAIN" lab is seeded, and lists have default content. Amendment drafts (Decisions A–G) sit ready in `docs/notion-amendments-2026-07-13.md`; `docs/PROJECT_STATE.md` §8 carries a full drift table.
- `docs/build-report.md` is a 3-line supersession stub pointing at PROJECT_STATE.md.
- Decision-log 3 Jul names "react-hook-form + zod" as the form stack — neither is installed; forms are hand-rolled server-action forms.
- README's "with .env.local → Supabase" description predates the current test-mode .env.local (Supabase vars commented out).
- `docs/PROJECT_STATE.md` (updated 21 Jul 2026) is the accurate as-built snapshot and says so.

## 12. Known gaps and incomplete work

### 12.1 TODO/FIXME sweep

Zero hits. `grep -rE "TODO|FIXME|HACK|XXX"` over `app/`, `components/`, `lib/`, `hooks/` (ts/tsx) returns nothing. Incomplete work is instead marked in prose comments ("hook, not the epic", "mock simplification", "[PARTIAL]-style notes") and tracked in docs/PROJECT_STATE.md §6.

### 12.2 Cross-cutting gaps

- **Auth is the only real adapter seam actually wired to a second backend**, and that backend is parked with known schema drift (two DB roles vs five app roles; no lab assignments; migrations predate org-wide jobs). All other `lib/*/index.ts` switches are hard-wired to mocks.
- **`resetPassword` never changes a password** in the mock (unlock side-effect only) — a tester following the reset flow will find the old password still works and the new one doesn't. Documented in-code as a mock simplification.
- Password reset "email" only exists as a dev-server console line; without console access the flow is untestable beyond the request form.
- The committed `.env.local` currently forces the CLEAN seed — testers expecting the demo dataset must edit it. The login page label switches accordingly ("Clean start (dev only)" vs "Demo accounts (dev only)", `app/(auth)/login/demo-accounts.tsx`).
- Session cookie is unsigned (forgeable) by design of the mock; `proxy.ts` route gating is cookie-only — the real boundary is the per-request live re-validation in `resolveOrgContext`.
- `lab.hasActiveWork` is a partly-mock flag (seeded, stands in for unfinished-work detection beyond batches) — deactivation guards read it plus real open batches (`lib/mock-db.ts` comment ~line 68).
- Reporting rounding is documented but unimplemented: `MethodAnalyte.decimals` is stored/edited yet no rounding happens anywhere (epic F scope; PROJECT_STATE §6.4).
- No auth-event log: logins/failures/lockouts mutate counters but append no event records (PROJECT_STATE §6.6).
- Seed checksums are placeholder strings, so checksum display for seeded files shows obviously fake values while UI-uploaded files show real SHA-256 — visible inconsistency a tester may flag.
- Keyboard-inaccessible row navigation on the batches and equipment lists (see §10.1) while the jobs list has the accessible in-cell-link pattern — an inconsistency between similar pages.
- `docs/review-progress.md` and `docs/review-changes.md` document ~121 scratch-harness review checks that were never committed as tests; the committed suite (70 tests) covers invariants + triage guards only.

### 12.3 Shell, auth & platform gaps

- No `loading.tsx`/`error.tsx`/`not-found.tsx` anywhere in `app/` — no route-level loading or error boundaries in the entire application.
- `app/(auth)/login/demo-accounts.tsx` is explicitly "TEMPORARY dev aid" (header comment): delete when the real backend lands. Only renders in dev builds without `NEXT_PUBLIC_SUPABASE_URL`.
- Reset-password hint "At least 12 characters." is hard-coded in `reset-password-form.tsx` while the actual policy is configurable per org (`minPasswordLength`, `requireComplexity`) — the hint can disagree with the enforced rule; the server error is authoritative.
- `/platform` empty state missing (bare table when zero orgs) — only reachable in practice with a wiped clean seed, but it is the vendor's primary screen.
- "Open session" error placement: renders below the table, detached from the row that caused it (`organisation-table.tsx` line ~234).
- `app/platform/page.tsx` gates rendering on the **cookie** role only; the live re-check happens in the actions (`requirePlatformAdmin`). A stale-but-unexpired cookie of a demoted platform admin still renders the (read-only) org list [PARTIAL enforcement at page level; actions are safe].
- Session cookie is unsigned base64url JSON (mock-grade, forgeable) — stated in code comments as a deliberate mock limitation; middleware trusts it for routing decisions.
- No TODO/FIXME comments found in any file of this area (the only marker is the "TEMPORARY dev aid" header above).
- `visibleNav` with `role === null` would render main-nav items without conditions — currently unreachable because role-null users never get the shell (redirected to `/platform`), noted as latent behavior.

### 12.4 Jobs area gaps

- **Dead columns:** the Samples table on `/jobs/[id]` has "Batch" and "Step" columns that are hardcoded to `"—"` for every row (`job-detail-client.tsx` lines ~589-590) even though real batch data exists one tab over. Looks like an unfinished wiring.
- **Misleading label:** Details tab shows `"Lab (fixed at creation)"` (`job-detail-client.tsx` line ~506) while the value is the *derived* set of labs from requested methods and jobs no longer have a lab at all (13 Jul 2026 org-wide-jobs decision). The label text contradicts the implementation.
- **Attachments invisible:** deviation evidence uploads succeed and are audit-logged, but no page renders `sample.attachments` (no list, no download). Upload-only feature. [PARTIAL]
- **Deviation note edits unaudited:** the edit diff logger (`updateJob` in `lib/jobs/mock.ts`) diffs type/description/customer-ref/quantity/methods/condition/storage but NOT `deviationNote` or `deviationType` — changing only the note produces no audit event.
- **Date display inconsistency:** entry is strictly dd-mm-yyyy, but the jobs list and history render raw ISO slices (`receivedAt.slice(0,10)` → yyyy-mm-dd); `createdAt`/consultation timestamps are stored pre-formatted with `toLocaleDateString("en-GB")` ("21 Jul 2026") — three different date renderings in one area.
- **Priority is hardcoded** (`Standard`/`High`/`Urgent` in `job-form.tsx`), unlike the org-configurable lists used elsewhere; server stores the string without whitelisting it.
- **No empty-state row for History** (empty table renders bare headers) while the Batches tab and jobs list do have empty-state text.
- **Single shared error slot:** all server validation surfaces as one Alert above the submit button — on the long registration form, a per-sample error ("Each sample needs a description.") does not point at the offending row.
- No TODO/FIXME comments in `app/(app)/jobs/**` or `lib/jobs/**`.
- Search on /jobs covers id + customer only (not notes/refs); no global search exists anywhere in the app.

### 12.5 Batches area gaps

- **No route-level loading/error/not-found files** anywhere in the batches area (or the app) — slow renders show nothing; server exceptions fall through to Next.js defaults.
- **Import-configs empty state is stale twice** (`configs-client.tsx:419-425`): `colSpan={7}` under an 8-column header (the Lab column was added on 17 Jul without bumping the span), and the text "No import configurations in this lab yet." still says "in this lab" although the list is now org-/labs-wide (triage decision 11).
- **Missing period in UI copy** (`batch-detail-client.tsx:877-879`): "…the batch is **awaiting review** Review is a system phase…" — two sentences run together.
- **Module-level `rowSeq` counter** in `configs-client.tsx:45-46` generates React keys — grows monotonically across dialog opens; harmless but unusual.
- **Client-side quantity coercion** (`new-batch-client.tsx:87-93` and the composition dialog): out-of-range QC quantities silently become 1 instead of showing an error (the server would reject 0/100, but the client never sends them).
- **Two decimal regimes** (manual ambiguity-rule vs import declared-separator) are both intentional and documented, but a tester comparing "1,234" behavior across manual entry (rejected as ambiguous) and a comma-declared import (accepted as 1.234) should know the difference is by design (ADR-4 + US-D5 AC 5).
- The queue **search matches batch id only** — no method/assignee/sample search; no column sorting anywhere in the area; no pagination anywhere (fine at mock scale, a finding at real scale).
- `page.tsx` `/batches` computes `canCreate` without the analyst clearance check (server enforces it) — an uncleared analyst in a permissive lab sees "+ New batch", opens the form, and only learns on submit ("You are not cleared for this method." — or sees no methods, [UNVERIFIED] whether `creationOptions` pre-filters by clearance).
- **No TODO/FIXME comments** found in the batches frontend files.
- The worksheet upload accepts `.pdf`/`.xls`/`.csv` but only `.xlsx` worksheets can ever auto-read; uploading a PDF succeeds and simply yields the fallback notice — intentional (the worksheet is evidence first), but worth a test case.
- `WorksheetReadDialog` renders its preview-expired/notice errors in a **non-destructive** Alert (`results-grid.tsx:473-477`) while every sibling uses `variant="destructive"` — cosmetic inconsistency.

### 12.6 Masterdata, admin & settings gaps

- **No TODO/FIXME comments** anywhere under `app/(app)` (grep verified).
- **List-page inconsistencies**: equipment has search + 2 filters + show-inactive; methods, QC materials, labs and users have **no search or filters at all**. No list in this area has pagination or column sorting. Row navigation: methods = name link, equipment = whole-row click; labs/users/QC = no detail page (dialogs instead).
- **Redirect-target inconsistency**: unauthorized/no-org actors are sent to `/` by methods/users/labs/roles/settings but to `/platform` by equipment and QC materials (`resolveEquipmentActor`, `resolveQcActor`).
- **Client-only caps**: method code ≤12 and QC code ≤12 are `maxLength` attributes only — the server accepts any length (lab code and equipment ID do have server rules). File-type `accept` filters (template `.xlsx,.xls,.csv`, certificates `.pdf,image/*`) are client-only; the server checks only non-empty and ≤5 MB.
- **User email validation is minimal**: server rule is literally `input.email.includes("@")`.
- **User status change requires no reason**, unlike every other deactivation in this area — inconsistent with the "with a reason" invariant wording (the account events do record the status diff).
- **Audit-trail read UI asymmetry**: equipment shows its History tab, but method events, user events, equipment-type events, QC events and settingsEvents have no visible UI anywhere (write-only stores; epic E per comments).
- **/admin/labs and /admin/users render bare tables when empty** (no empty-state row), and the Lab-settings card silently disappears when no active labs exist.
- **Breadcrumb root is "Jobs"** on equipment/QC/admin/settings pages (`BreadcrumbLink href="/jobs"`) — the "home" crumb is the Jobs list, while methods' breadcrumb starts at "Methods" with no home link; cosmetic inconsistency.
- **QC materials page payload**: full details (incl. expected values and status reasons) of every material are serialized into the page for dialog prefill (`page.tsx:25`) — fine at mock scale, notable for testing large orgs.
- Surprise: **new-user "invitation" is a console.log** — the account is immediately usable with the demo password (`lib/users/mock.ts:194`); the dialog copy promises an email flow that does not exist in the mock.
- Surprise: the barcode "Symbology" control is a read-only text input stating Code 128 with "QR / DataMatrix — later." — intentional placeholder, the only visible not-yet-functional control in this area.
- [UNVERIFIED] Sort order of method/QC/user lists is store-insertion order (no explicit sort in `listMethods`/`listMaterials`/`listUsers`); equipment types are sorted by name (`lib/equipment/mock.ts:860`).

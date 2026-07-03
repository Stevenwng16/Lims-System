# US-A3 — Navigation shell & landing page

*Status: written with Fable 5 — reviewed & frozen 1 Jul 2026 · build: phase 1*
> **User story**
> As a lab user, I want every screen to live inside one consistent shell with clear navigation and a sensible landing page, so that I always know where I am, what I can reach, and where my work starts.

*Scope note: the shell is the persistent frame — navigation, context, user menu, system-message area. The menu's contents grow as epics land; this story delivers the mechanism plus the phase-1 state. Role-aware visibility is specified here and finally verified together with US-A4 (roles land right after the shell in build order).*
**Acceptance criteria**
1. After login (US-A1), every authenticated screen renders inside one consistent shell: primary navigation, the current organisation and lab context, the signed-in user's name, and a logout action are always visible or one click away. Unauthenticated pages (login, password reset) show no shell (US-A1 AC 10).
2. The target navigation structure is: **Jobs**, **Batches**, **Quality** (QC materials, Equipment), **Methods**, **Reports**, **Admin** (Users, Labs, Settings). Menu items appear only once their feature exists: the shell ships in phase 1 with the sections that exist then and grows per story without layout rework. (Structure indicative, like all UI sketches.)
3. Menu visibility is role-aware: a user only sees entries their role permits (capability matrix in US-A4). Hidden menu items are presentation only — server-side authorization remains the boundary (invariant 4). Until US-A4 lands, the only user type is the seeded organisation admin, who sees everything that exists; this criterion is verified end-to-end together with US-A4.
4. The active lab is always visible in the shell. A user assigned to multiple labs (US-A6) switches via an always-available lab switcher; all screens show data of the active lab only. A user with exactly one lab sees the lab name, no switcher.
5. **Landing page (resolves US-A1 AC 2):** after login the user lands on the Job overview (US-C2). While US-C2 does not yet exist (phase 1), a minimal home screen — organisation name, active lab, the user's role, links to available sections — serves as the landing page. A future dashboard (epic G) may replace it per organisation preference (Later).
6. The shell contains a persistent system-message area: the support-session banner (US-A2 AC 9) renders here, and future global notices (e.g. maintenance) use the same slot. The area is invisible when empty.
7. The active section is visually highlighted, every page has a clear title, and nested detail pages (e.g. job → sample) show a breadcrumb back to their parent list.
8. The sidebar can collapse to icon-only mode and back; the preference is remembered per user.
9. The shell works on desktop and tablet (lab terminals): on narrow screens, navigation collapses into a toggleable menu without losing access to any item.
10. Navigating between sections preserves the session and the active-lab context — no re-login, no silent context reset.
**Developer decisions (this story)**
- **Choose here:** SPA vs server-rendered, and the UI component approach — this story is the natural moment, since every later screen renders inside this shell.
- **Log it:** one line in the Decision log.
**Frontend (UI)**
```plain text
┌──────────────────────────────────────────────────────────┐
│ 🔬 LIMS   [Lab: Metals ▾]        Jane Doe (Analyst) [Logout]│
│ ──────────────────────────────────────────────────────── │
│ ⚠ system-message area (support banner / notices)          │
├──────────────┬───────────────────────────────────────────┤
│ [◀]          │                                           │
│ 📋 Jobs      │                                           │
│ 🗂 Batches   │                                           │
│ 🧪 Quality ▾ │            (page content)                 │
│  └ QC mat.   │                                           │
│  └ Equipment │                                           │
│ ⚗️ Methods   │                                           │
│ 📄 Reports   │                                           │
│ ⚙️ Admin ▾   │                                           │
│  └ Users     │                                           │
│  └ Labs      │                                           │
│  └ Settings  │                                           │
└──────────────┴───────────────────────────────────────────┘

Phase-1 home (until US-C2 exists):
┌──────────────────────────────────────────────┐
│  Welcome, Jane — Lab Alpha BV / Metals lab    │
│  Role: Admin                                  │
│  → Users   → Labs   → Settings                │
└──────────────────────────────────────────────┘
```
**Authorization**
- Every authenticated user gets the shell; menu visibility follows the US-A4 capability matrix.
- The lab switcher only offers labs the user is assigned to (US-A6).
- The shell itself grants nothing: it renders what the server says the user may see (invariant 4).
**Definition of Done**
- All acceptance criteria met and verifiable (AC 3 finally verified at US-A4 delivery — recorded as an open check until then).
- Verified on desktop and tablet widths.
- Menu reachable and operable by keyboard.
- Collapse preference persists across sessions (tested).
- No authenticated screen exists outside the shell.
**ISO 17025 / compliance**
- No clause maps directly to a navigation shell — this story is the concrete anchor of the interview requirement "user-friendliness". It does carry compliance-relevant signals: the support-session banner (§4.2 transparency, US-A2) and the always-visible organisation/lab context, which prevents working-in-the-wrong-lab mistakes in daily practice.
- Invariant 4 note: menu visibility is never the security boundary.
**Later (Part 11 / growth)**
- Notification icon + centre (rides on the notification framework designed at epic D).
- Dashboard (epic G) as optional landing page per organisation.
- Global search across jobs/samples (was v0 US-33; until then, search lives in the list views, US-C2).
- Per-organisation branding in the shell.

## Changelog vs v1
- **New story — no v1 counterpart.** In v1, navigation existed only as a "Doorlopend" principle without a buildable artifact (review finding); the landing page referenced by v1 US-A1 AC 2 was undefined.
- **Absorbs v0 US-01** (Navigation Structure & Main Layout): collapsible sidebar with remembered preference (AC 8), active-item highlighting (AC 7), header with user + logout (AC 1), role-based visibility (AC 3) — all preserved.
- **Differences vs v0 US-01:** landing page now explicitly defined (Job overview once US-C2 exists; minimal home in phase 1) instead of v0's Dashboard — the dashboard moved to epic G by deliberate phasing; menu structure updated to the v2 epic map (Quality = QC materials + Equipment; Admin = Users/Labs/Settings); added the system-message area for the US-A2 support banner; added the lab switcher tied to multi-lab assignment (US-A6); added the phase-aware delivery note (AC 3 verified with US-A4).
- **Key decision to confirm:** landing page = Job overview (US-C2) for all roles once it exists. Alternative would be role-specific landing pages — deliberately not chosen (more config, little gain; a dashboard per role is epic-G territory). **✅ Confirmed (1 Jul 2026).**
- **1 Jul 2026:** Implementation note converted to the standard **Developer decisions** block — content unchanged, new story anatomy.

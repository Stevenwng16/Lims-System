# US-A4 — Roles & permissions

*Status: written with Fable 5 — reviewed & frozen 1 Jul 2026 · build: phase 1*
> **User story**
> As an administrator, I want clearly defined roles with set permissions, so that every user can only do what their job requires and the system stays secure and traceable.

*Scope note: these are the roles within a customer organisation. The platform level (vendor staff, support access) is defined in US-A2 and is invisible to organisations. Editable per-user role assignment, clearances and lab assignments live in User management (US-A6); this story defines and enforces the permission model itself.*
**Acceptance criteria**
1. The system defines a fixed set of standard roles: **Admin**, **Lab manager**, **Analyst** and **Read-only**. Each user is assigned exactly one role.
2. Permissions are defined per role as a capability matrix. This matrix is the single source of truth and is enforced server-side on every protected action — not only by hiding buttons in the UI.
3. Role capabilities (summary):
	- **Admin** — everything below, plus organisation configuration 🆕 (was: system configuration): Settings, Users, Labs, Methods, Equipment. Can assign the Admin role.
	- **Lab manager** — create and manage jobs and batches; manage QC, equipment and methods within their lab; view all data and the full audit trail; review and approve; assign method clearances to analysts. Cannot change organisation-level settings or create admins.
	- **Analyst** — work on batches assigned to them: enter data, enter QC results and advance steps, but only for methods they are cleared for; view data within their lab. **Does not create jobs or batches** and does not review/approve.
	- **Read-only** — view jobs, batches, results and history. No create, edit or delete action anywhere.
4. **Job creation** is restricted to Admin and Lab manager. Sample login / job registration is a reception task, not a bench-analyst task.
5. **Batch creation** is restricted to Admin and Lab manager by default. Whether Analysts may also create batches is a **configurable per-lab setting** (default: off; lives in Settings, US-A7). When the setting is on, an Analyst may create batches only for methods they are cleared for. This covers labs where analysts assemble their own runs.
6. **Method clearance (bevoegdheid):** on top of the role, an Analyst can only perform work (data entry, advancing steps) for methods they are individually cleared for. Clearances are assigned per user (in User management, US-A6) and enforced by this permission layer. Acting on an uncleared method is blocked with a clear message stating the user is not cleared for that method.
7. **Lab scope:** each user is assigned to one or more labs and can only see and act on data belonging to their assigned lab(s). 🆕 This is the *inner* boundary; the *outer* boundary is the organisation (invariant 5, enforced by US-A1 AC 13 / US-A2 AC 2). Lab scoping never crosses the organisation boundary.
8. A user can never perform an action their role or clearance does not allow, even via a direct URL or API call — enforcement is always server-side.
9. A user cannot change their own role, clearances or lab assignment (no self-escalation).
10. Each organisation 🆕 always retains at least one active Admin: the last remaining Admin of an organisation cannot be demoted or deactivated.
11. Every change to a role assignment, method clearance or lab assignment is written to the append-only audit log (who changed what, for whom, when).
12. The UI shows only the navigation items and actions the current user is permitted to use (rendered by the shell, US-A3 AC 3 🆕); any hidden control is also blocked server-side.
13. 🆕 **Vendor support sessions (US-A2) pass through this same matrix:** a read-only support session operates with Read-only capabilities; a session with granted admin rights operates with Admin capabilities. There is no separate permission path for support.
**Frontend (UI)**
A read-only reference matrix under Admin, so anyone can see at a glance what each role can do. Editable per-user clearances and role assignment live in User management (US-A6).
```plain text
Admin ▸ Roles & permissions

Capability                   Admin   Lab mgr   Analyst   Read-only
──────────────────────────────────────────────────────────────────
View data                      ✓        ✓         ✓           ✓
Create jobs                    ✓        ✓         –           –
Create batches                 ✓        ✓         –†          –
Enter data / advance steps     ✓        ✓         ✓*          –
Review & approve               ✓        ✓         –           –
Manage methods/equipment/QC    ✓        ✓         –           –
Assign method clearances       ✓        ✓         –           –
Manage users                   ✓        –         –           –
Organisation settings          ✓        –         –           –

*  Analyst: only for methods they are cleared for
†  Configurable per lab (default off); if on, only for cleared methods
```
**Authorization**
- Only **Admin** assigns roles and grants the Admin role.
- **Admin** and **Lab manager** assign method clearances and lab assignments (Lab manager only within their own lab).
- **Admin** configures the per-lab "Analysts may create batches" setting (lives in Settings, US-A7).
- **Analyst** and **Read-only** cannot change any permission, role or clearance.
**Definition of Done**
- All acceptance criteria met and verifiable.
- Permission enforcement is server-side and tested for every role (including direct-URL / API attempts).
- Last-admin protection verified by test (per organisation).
- Method-clearance block verified by test (cleared vs not cleared).
- "Analysts may create batches" toggle verified by test in both states.
- 🆕 Support-session capability mapping verified by test (read-only grant vs admin grant).
- 🆕 US-A3 AC 3 (role-aware menu visibility) finally verified here, together with this story.
- All role/clearance/lab changes appear in the audit log.
**ISO 17025 / compliance**
- **§7.11** — access levels / authorized access to data and functions.
- **§6.2** — personnel: method clearance ensures only authorized (competent) personnel perform a given activity. The clearance flag is the system-side anchor for that authorization.
**Later (Part 11)**
- Custom, more granular roles beyond the fixed four.
- Segregation of duties enforced (e.g. the person who ran a batch cannot approve its own report).
- Periodic access recertification (admin reviews and re-confirms permissions on a schedule).
- Method clearance linked to training/competency records, with an expiry date (candidate in the coverage map, §6.2).

## Changelog vs v1 (was: US-A2)
- **Renumbered** US-A2 → US-A4; cross-references updated: User management = US-A6, Settings = US-A7, menu visibility = US-A3.
- **Scope note (new):** organisation roles vs the platform level (US-A2) made explicit.
- **AC 3:** "system configuration" → "organisation configuration" (ADR-1: Settings/Users/Labs are organisation-level; true system level belongs to the platform, US-A2).
- **AC 7:** two-boundary framing added — lab scope is the inner boundary, organisation isolation (invariant 5) the outer; wording only, behaviour unchanged.
- **AC 10:** last-admin protection now explicitly **per organisation** (ADR-1).
- **AC 12:** rendering side now delegated to the shell (US-A3 AC 3); enforcement stays here.
- **AC 13 (new):** vendor support sessions (US-A2) pass through this same capability matrix — read-only grant = Read-only capabilities, admin grant = Admin capabilities. One permission path, no special cases.
- **Deliberately unchanged:** the per-lab "Analysts may create batches" toggle stays **per lab** — it is workflow policy, which genuinely differs per department; contrast with MFA (US-A1), which moved to organisation level because it is security policy. Flagging so the asymmetry is a decision, not an oversight.
- **Unchanged:** AC 1, 2, 4, 5, 6, 8, 9, 11; capability matrix; user story; compliance block; Later (plus a pointer to the §6.2 training-record candidate).
- **DoD:** + support-session mapping test, + the deferred US-A3 AC 3 verification lands here.

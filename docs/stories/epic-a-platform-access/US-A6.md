# US-A6 — User management

*Status: written with Fable 5 — reviewed & frozen 1 Jul 2026 (AC 13 added) · build: phase 1*
> **User story**
> As an administrator or lab manager, I want to create and manage user accounts with their role, lab(s) and method clearances, so that the right people have the right access and every action stays traceable to a real person.

*Scope note: all user management here is organisation-scoped (invariant 5); a user account belongs to exactly one organisation (see AC 11). The organisation's first account — the seeded admin — is created by provisioning (US-A2 AC 4), not via this screen, but uses the same invitation mechanism as AC 3.*
**Acceptance criteria**
1. Admins and lab managers can view a list of users showing name, email, role, assigned lab(s), status (active/inactive) and last login. Lab managers see only users in their own lab(s); admins see all.
2. A new user is created with: full name, unique email, role, one or more lab assignments, and — for Analysts — their initial method clearances.
3. On creation the user receives an email invitation to set their own password and enrol MFA (if required for the organisation 🆕, US-A1 AC 5). The administrator never sets or sees the user's password. This reuses the mechanism from US-A1.
4. An existing user's name, email, role, lab assignment(s) and method clearances can be edited. Changes take effect immediately and are enforced at the moment of action (a revoked clearance blocks further work straight away).
5. Method clearances are managed per user as the list of methods they are cleared to work on. Granting or revoking is immediate.
6. **Users are deactivated, never deleted.** A deactivated user can no longer log in, but the account record is retained so all of their historical actions remain attributable in the audit trail. A deactivated user can be reactivated.
7. An administrator can trigger a password reset or unlock a locked account for any user (ties to US-A1).
8. The last remaining active Admin of an organisation 🆕 cannot be deactivated or have their role changed (last-admin protection, US-A4 AC 10).
9. No user can edit their own role, clearances or lab assignment (no self-escalation). Users edit their own name, password and MFA via their own profile, not here.
10. Lab managers cannot create or manage Admins or other Lab managers, and cannot grant the Admin or Lab manager role. They manage Analyst and Read-only users within their own lab(s) only.
11. Email must be unique across the platform 🆕 (all organisations). Reusing an existing email shows a clear error. Consequence: one account belongs to exactly one organisation in the MVP — a person working for two customer organisations needs two email addresses for now (multi-organisation membership: see Later).
12. Every user-management action (create, role change, clearance grant/revoke, lab change, activate/deactivate, reset/unlock) is written to the append-only audit log, recording who did it, to whom, what changed and when.
13. 🆕 **Future-proof identity (design constraint):** the data model separates a user's *identity* (email + credentials) from their *organisation membership* (role, lab assignments, clearances) as two distinct concepts, even though the MVP allows exactly one membership per identity (AC 11). This keeps multi-organisation membership (Later) a policy change plus a workspace picker at login — not a data migration. Mirrors the SSO-ready constraint in US-A1 AC 12.
**Frontend (UI)**
```plain text
Admin ▸ Users                                          [ + New user ]

Name            Email              Role          Lab(s)        Status     Last login
─────────────────────────────────────────────────────────────────────────────────────
Anna de Vries   anna@lab.nl        Lab manager   Lab A         Active     2026-06-08
Pieter Jansen   pieter@lab.nl      Analyst       Lab A, Lab B  Active     2026-06-09
Sara Khan       sara@lab.nl        Read-only     Lab A         Inactive   —
```
```plain text
Edit user — Pieter Jansen

  Full name   [ Pieter Jansen           ]
  Email       [ pieter@lab.nl           ]
  Role        [ Analyst             ▼ ]
  Lab(s)      [x] Lab A   [x] Lab B   [ ] Lab C

  Method clearances  (Analyst only)
     [x] Method 1     [ ] Method 2     [x] Method 3

  Status      (•) Active    ( ) Inactive

  [ Send password reset ]   [ Unlock account ]

                                      [ Cancel ]   [ Save ]
```
**Authorization**
- **Admin** — full user management across all labs of their organisation; assigns any role including Admin and Lab manager; resets/unlocks any account.
- **Lab manager** — creates and manages Analyst and Read-only users within their own lab(s); assigns method clearances within their lab; cannot touch Admins or Lab managers or grant those roles.
- **Analyst / Read-only** — no access to user management; can only manage their own profile.
**Definition of Done**
- All acceptance criteria met and verifiable.
- Invite / set-password flow works end to end; no admin-set passwords anywhere.
- Deactivate-not-delete verified: a deactivated user's historical audit entries stay intact and attributable.
- Last-admin protection verified by test (per organisation).
- Lab-scope verified: a lab manager cannot see or edit users outside their lab(s).
- 🆕 Email uniqueness verified across organisations (registration in org B with an email known in org A is rejected).
- All user-management actions appear in the audit log.
**ISO 17025 / compliance**
- **§6.2** — personnel: records who is authorized for which methods/role (the basis for competent, authorized work).
- **§7.11** — access management.
- **ALCOA+** — *Attributable*: deactivate-not-delete keeps historical actions tied to a real, retained identity.
**Later (Part 11 / growth)**
- Electronic signature required to apply user/permission changes.
- Method clearance linked to a training/competency record with an expiry date; clearance auto-suspends when training lapses.
- Periodic access recertification: admins are prompted on a schedule to re-confirm each user's access.
- Segregation-of-duties checks when assigning combinations of roles/clearances.
- 🆕 Multi-organisation membership (one identity working in two customer organisations, e.g. consultants) — requires org-scoped login; revisit after the subdomain/path decision (ADR-1, open question 2).

## Changelog vs v1 (was: US-A3)
- **Renumbered** US-A3 → US-A6; this completes the order swap (labs US-A5 before users US-A6). Cross-references updated: last-admin protection = US-A4 AC 10.
- **AC 3:** MFA wording aligned with US-A1 AC 5 — requirement is now per **organisation** (was: per lab). Pure consistency fix following the A1 change.
- **AC 8:** last-admin protection explicitly per organisation (ADR-1).
- **AC 11:** ⚠️ real product decision — email uniqueness kept **platform-wide** (was: "across the system", which is now ambiguous under multi-tenancy). Consequence: one account = one organisation in the MVP; a consultant serving two customer labs needs two addresses. Reasoning: keeps login unambiguous regardless of the subdomain/path choice (ADR-1 open question 2). *Alternative:* uniqueness per organisation — allows one address in multiple orgs but forces org-scoped login, coupling this story to the subdomain decision. Deferred via a new Later item (multi-organisation membership). Your call together with development. **✅ Confirmed (1 Jul 2026): platform-wide uniqueness stays for the MVP, future-proofed via new AC 13.**
- **Scope note (new):** seeded admin comes from provisioning (US-A2), same invite mechanism; everything here is organisation-scoped.
- **Unchanged:** AC 1, 2, 4, 5, 6, 7, 9, 10, 12; user story; both UI sketches; Authorization (org framing only); compliance block; Later items 1–4.
- **DoD:** + cross-organisation email-uniqueness test.
- **AC 13 (new, 1 Jul 2026):** identity (email + credentials) and organisation membership (role, labs, clearances) modelled as two separate concepts — MVP behaviour unchanged (one membership per identity, AC 11), but multi-organisation membership later becomes a policy change + a login workspace picker instead of a data migration. Mirrors the SSO-ready pattern of US-A1 AC 12.

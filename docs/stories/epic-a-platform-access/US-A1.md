# US-A1 — Authentication & session

*Status: written with Fable 5 — reviewed & frozen 1 Jul 2026 · build: phase 1*
> **User story**
> As a lab user, I want to log in to the LIMS with my own personal account, so that I get secure access and every action I take is traceable to me as an individual.

*Scope note: this story covers authentication of lab users (customer organisations). Platform-level accounts (vendor/support access) are defined in US-A2.*
**Acceptance criteria**
1. Every user has a unique personal account, identified by a unique email address. Shared or generic accounts are not allowed — this is what makes the audit trail attributable to a real person.
2. A user logs in with email + password. A successful login starts an authenticated session and lands the user on the landing page (defined in US-A3 🆕).
3. A failed login shows a generic error message (it does not reveal whether the email exists) and the failed attempt is recorded.
4. The password policy (minimum length, complexity) is configurable in Settings (US-A7), organisation-wide 🆕, and enforced on account creation and every password change. Sensible default: minimum 12 characters.
5. Multi-factor authentication (MFA) via a TOTP authenticator app is supported and can be enabled or required per organisation 🆕 (was: per lab). When MFA is required, the session is not authenticated until the second factor is verified.
6. A user can reset their password via a time-limited link sent to their email. Completing a reset invalidates the old password and ends all active sessions for that account.
7. After a configurable number of consecutive failed attempts (default 5), the account is locked. A locked account can only be restored via password reset or by an admin unlock. Lockouts are recorded.
8. The session ends automatically after a configurable period of inactivity (default 30 minutes) — important for shared lab terminals. A logout button ends the session immediately.
9. Every authentication event (login success, login failure, logout, lockout, password change, MFA enrolment) is written to the append-only audit log with the user, timestamp, event type and the user's organisation 🆕 (ADR-1).
10. Unauthenticated users can only reach the login and password-reset pages. Any other route redirects to the login page.
11. 🆕 When an organisation is provisioned (US-A2), exactly one seeded organisation-admin account exists for it, so that organisation's first administrator can sign in and create the real users. (Was: one seeded admin "on first system setup" — superseded by ADR-1.)
12. **SSO-ready (design constraint):** the user model and session layer must allow adding SAML/OIDC SSO later without changing how users, roles or audit entries are stored. A user's identity must not be coupled to the password mechanism.
13. 🆕 An authenticated session is bound to the user's organisation; every request within that session operates inside that organisation's boundary (invariant 5). The isolation mechanism follows ADR-1; this criterion holds regardless of the subdomain/path decision (ADR-1, open question 2).
**Developer decisions (this story)**
- **Choose here:** the managed auth provider. Requirements it must meet: AC 1–13 (personal accounts, TOTP MFA, reset, lockout, session timeout, SSO-ready per AC 12, organisation-bound sessions per AC 13).
- *Non-binding advice:* given the Azure stack, Microsoft Entra ID (External ID) is the natural candidate and makes AC 12 nearly free — Supabase Auth, Auth0 or similar remain acceptable. The story is provider-agnostic on purpose, so a later switch requires no story rewrite.
- **Log it:** one line in the Decision log (what, why, date).
**Frontend (UI)**
```plain text
┌─────────────────────────────────────┐
│              [ LIMS logo ]           │
│                                      │
│   Email     [____________________]   │
│   Password  [____________________]   │
│                                      │
│            [    Log in    ]          │
│                                      │
│            Forgot password?          │
└─────────────────────────────────────┘

  → if MFA required, after password:
┌─────────────────────────────────────┐
│   Enter the 6-digit code from your   │
│   authenticator app                  │
│            [ _ _ _  _ _ _ ]          │
│            [   Verify    ]           │
└─────────────────────────────────────┘
```
Plain, single-purpose screens. No navigation shell is shown until the session is authenticated (shell: US-A3).
**Authorization**
- Anyone with valid credentials can authenticate.
- Every authenticated user can change their own password and manage their own MFA.
- Only Admin (organisation level) can unlock accounts, trigger a reset for another user, and configure the password policy, lockout threshold, session timeout and the organisation-wide MFA requirement 🆕 (these settings live in *Settings*, US-A7; this story enforces them).
- Unauthenticated visitors can only access the login and password-reset pages.
**Definition of Done**
- All acceptance criteria met and verifiable.
- Credentials handled by the chosen managed auth provider — no plaintext storage, no custom-built password hashing.
- All authentication events appear in the audit log.
- Works on desktop and tablet (lab terminals).
- Session timeout and account lockout verified by test.
- 🆕 Tenant binding verified by test: a valid session cannot read or write data of another organisation (invariant 5).
- Auth flow reviewed for security before release.
**ISO 17025 / compliance**
- **§7.11** — control of data & information management: authorized access to the system and protection of integrity.
- **ALCOA+** — *Attributable*: unique personal accounts make every later action traceable to one person. This story is the foundation the whole audit trail rests on.
**Later (Part 11)**
- MFA becomes mandatory rather than optional.
- Re-authentication is required to apply an electronic signature (reuses this same login).
- Password policy and session rules are locked to a validated configuration.
- SSO/SAML connection can be enabled per enterprise tenant.

## Changelog vs v1 (was: US-A1)
- **AC 2:** reference to US-A3 added — the landing page was undefined in v1 ("appropriate to their role"); it now has a home in the navigation-shell story.
- **AC 4:** password policy explicitly **organisation-wide** + Settings reference renumbered to US-A7 (ADR-1: "system-wide" settings become organisation settings).
- **AC 5:** ⚠️ the only behavioural change — MFA requirement moved from **per lab** to **per organisation** (ADR-1: security policy belongs to the customer organisation, not to a department). Easy to revert if per-lab granularity is wanted — Ramazan's call. **✅ Confirmed (1 Jul 2026): stays per organisation.**
- **AC 9:** auth events now carry the user's organisation (ADR-1; needed for tenant-scoped audit).
- **AC 11:** seeded admin moved from "on first system setup" to **per organisation at provisioning** (ADR-1; provisioning itself = US-A2).
- **AC 13 (new):** session bound to the user's organisation — invariant 5 at session level, phrased mechanism-neutral so the story holds regardless of the ADR-1 choice.
- **Scope note (new):** platform accounts (vendor/support) explicitly out of scope → US-A2.
- **Definition of Done:** tenant-binding test added.
- **Implementation note:** provider examples updated to the Azure context (Entra ID as the natural candidate); remains non-binding.
- **Unchanged:** AC 1, 3, 6, 7, 8, 10, 12; user story; UI sketch; compliance block; Later (Part 11).
- **1 Jul 2026:** Implementation note converted to the standard **Developer decisions** block — content unchanged, new story anatomy.

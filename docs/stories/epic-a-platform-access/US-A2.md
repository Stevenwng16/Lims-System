# US-A2 — Organisations & platform administration

*Status: written with Fable 5 — reviewed & frozen 1 Jul 2026 · build: phase 1*
> **User story**
> As the platform operator (vendor), I want to provision and manage customer organisations as isolated tenants, so that many labs can use one product without ever seeing each other's data — and so that we can support customers without uncontrolled access to their environment.

*Scope note: this story creates the tenant layer from ADR-1 and the minimal vendor-side tooling around it. Billing/invoicing, self-service signup and per-organisation branding are explicitly out of scope (see Later). Organisation-wide settings themselves live in US-A7; users within an organisation in US-A6.*
**Acceptance criteria**
1. Every customer organisation is a distinct entity with a unique ID, a name, a status (active / suspended / deactivated) and a creation date. Organisations are never deleted (invariant 2): deactivation requires a reason and is recorded.
2. **Tenant boundary (invariant 5):** every domain record in the system belongs to exactly one organisation. No query, view, export or API response may ever return data belonging to a different organisation than the session's organisation. The isolation *mechanism* (shared database + row-level security, schema-per-tenant, or other) is the developer's choice within ADR-1 — this criterion holds regardless of that choice.
3. There is a platform level above all customer organisations, invisible to customers, with the role **Platform admin** (vendor staff). Platform accounts are personal (no shared accounts, same rule as US-A1 AC 1) and platform actions are written to a platform-level audit log, separate from customer audit logs.
4. A Platform admin can provision a new organisation by entering its name and the email address of its first administrator. Provisioning creates the seeded organisation-admin account (US-A1 AC 11) and sends a time-limited setup invitation. Until that administrator completes setup, the organisation contains no other users.
5. Provisioning seeds the organisation's settings (US-A7) with safe system defaults (password policy, session timeout, ID formats, …), so a new organisation is usable immediately without manual configuration.
6. A Platform admin can suspend an organisation (e.g. non-payment). Users of a suspended organisation cannot log in and see a clear, neutral message. No data is altered or removed by suspension; reactivation restores access exactly as it was. Both actions require a reason and are recorded.
7. An organisation carries a subscription status (trial / active / suspended / ended) visible to Platform admins. This is a status field only — billing and invoicing happen outside the system.
8. **Support access — consent first:** by default, platform staff have no access to the inside of any organisation. An organisation Admin can explicitly grant support access, scoped in time (default 72 hours, adjustable per grant), and can revoke an active grant at any time.
9. **Support access — execution & audit:** with an active grant, a Platform admin can open a support session into that organisation. A support session is read-only by default; the granting Admin can optionally allow "act with admin rights" for the duration of the grant. Every support session is (a) attributable to the individual platform user, (b) recorded in the organisation's own audit log (start, end, and every action performed), and (c) clearly marked in the UI while active ("Support session — vendor access").
10. Platform admins can see organisation metadata (name, status, subscription, user count) but **cannot** browse an organisation's domain data (jobs, samples, results, methods) without an active support grant. There is no cross-tenant reporting or aggregation in the MVP.
11. All audit log entries throughout the system carry the organisation context, and an organisation's audit log is only viewable within that organisation (generalisation of US-A1 AC 9; the platform-level log of AC 3 is the only exception and contains no customer domain data).
12. The platform console is a deliberately minimal internal tool: a list of organisations with status and subscription, a provisioning form, suspend/reactivate actions, and the support-grant status per organisation.
**Developer decisions (this story)**
- **Choose here:** the tenant-isolation mechanism — menu and trade-offs in ADR-1; the requirement that must hold whatever you pick is AC 2. Includes the database flavour (Azure SQL vs Azure Database for PostgreSQL — both support row-level security).
- **Choose here:** subdomain-per-customer vs path-based routing (ADR-1, open question 2 — touches auth cookies and the SSO-ready constraint of US-A1).
- *Non-binding advice:* option A (shared database + organisation_id + RLS); platform-staff authentication can ride on the US-A1 provider (e.g. a separate Entra directory for vendor staff).
- **Log it:** one line per choice in the Decision log.
**Frontend (UI)**
```plain text
Platform console (vendor-only)
┌──────────────────────────────────────────────────────┐
│ Organisations                        [+ New organisation]
│ ┌──────────────┬─────────┬──────────────┬───────────┐ │
│ │ Name         │ Status  │ Subscription │ Support   │ │
│ ├──────────────┼─────────┼──────────────┼───────────┤ │
│ │ Lab Alpha BV │ active  │ active       │ no grant  │ │
│ │ MetalTest NL │ active  │ trial        │ ⏱ 48h left│ │
│ │ OldCust BV   │ suspended│ ended       │ no grant  │ │
│ └──────────────┴─────────┴──────────────┴───────────┘ │
└──────────────────────────────────────────────────────┘

Customer side (Settings → Support access, org Admin only)
┌──────────────────────────────────────────────┐
│ Vendor support access                         │
│ Status: no active grant                       │
│ [ Grant access ]  duration: [72h ▾]           │
│ ☐ allow changes (admin rights)                │
│ Active sessions and all support actions       │
│ appear in your audit log.                     │
└──────────────────────────────────────────────┘
```
During an active support session the vendor user sees a persistent banner: "Support session — vendor access (read-only / admin)".
**Authorization**
- Platform admin: provision organisations, suspend/reactivate, view organisation metadata, open a support session **only** with an active grant.
- Organisation Admin: grant and revoke support access for their own organisation.
- Organisation users: no visibility of the platform level; they see support activity only via the banner context and their organisation's audit log.
- Nobody can access another organisation's data through any interface (AC 2) — enforced server-side (invariant 4).
**Definition of Done**
- All acceptance criteria met and verifiable.
- Automated isolation test: a valid session of organisation A cannot read or write any record of organisation B through any endpoint (structural test for invariant 5; the session-level variant lives in US-A1 DoD).
- Support flow tested end-to-end: grant → session → actions → revoke/expiry, with all entries visible in the customer's audit log.
- Provisioning tested: new organisation + seeded admin + seeded defaults result in a working, loginable environment.
- The chosen isolation mechanism and its rationale are recorded as a one-line entry in the decision log on the *Architectuurbeslissingen* page (ADR-1).
**ISO 17025 / compliance**
- **§4.2** — confidentiality: customer information is protected; vendor access only with explicit, informed, recorded consent.
- **§7.11** — control of data & information management: authorized access, tenant-level integrity protection.
- **ALCOA+** — *Attributable*: support actions are traceable to an individual vendor employee in the customer's own audit log.
**Later (Part 11 / growth)**
- Self-service trial signup (MVP is vendor-led provisioning, fitting B2B sales).
- Billing/invoicing integration behind the subscription status.
- Per-organisation branding (logo on reports — lands in epic F).
- Single-tenant / private deployment option for premium customers (ADR-1, open question 3).
- Data-residency choice per organisation.

## Changelog vs v1
- **New story — no v1 counterpart.** Source: ADR-1 (tenancy) and the review of 10–11 June; referenced forward by US-A1 (AC 11, scope note) and by invariant 5.
- Key scope decisions to confirm in review:
- **Vendor-led provisioning only** in MVP — no self-service signup (B2B sales-led; Later).
- **Subscription is a status field**, not a billing engine.
- **Support access is consent-first, time-boxed (default 72h) and read-only by default**, with opt-in admin rights per grant; every support action lands in the customer's own audit log. This is the "even the vendor cannot silently access your data" selling point from ADR-1.
- **Platform admins cannot browse customer domain data** without a grant; no cross-tenant aggregation in MVP (deliberate trust choice, also keeps ADR-1 mechanism options open).
- Mechanism-neutral wording throughout (AC 2): works under any ADR-1 option; the actual choice gets a one-line decision-log entry (DoD).
- **1 Jul 2026:** Implementation note converted to the standard **Developer decisions** block — content unchanged, new story anatomy.

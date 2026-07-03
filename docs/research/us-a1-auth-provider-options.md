# US-A1 — Auth provider evaluation (research note, 3 Jul 2026)

Status: **decision pending — Ramazan is deciding.** This note preserves the analysis; the chosen option gets one line in `decision-log.md` when decided. Sources were verified against live vendor docs/pricing on 3 Jul 2026.

## Hard requirements tested (from US-A1 ACs)

- AC 4 — password policy (min length, complexity) configurable **per organisation**
- AC 5 — **TOTP authenticator-app** MFA, requirable per organisation
- AC 7 — lockout after configurable N consecutive failures (default 5), admin unlock
- AC 3/9 — **every** auth event, including failed logins, into our append-only audit log
- AC 6 — password reset invalidates old password and ends all sessions
- AC 12 — SSO-ready (SAML/OIDC addable later without user-model change)

## Verdict per candidate

### Auth0 B2B Essentials — RECOMMENDED
- Meets every hard AC with documented vendor features: password policy per database connection (pattern: one connection per organisation), per-org TOTP requirement via post-login Action, brute-force threshold configurable 1–100 with Management API unlock, Log Streams webhook delivers all event types (success/failure/lockout/password change/MFA enrolment) near-real-time.
- Engineering liabilities: (1) password reset does NOT auto-revoke refresh tokens — needs a Post Change Password Action + short token lifetimes; (2) 30-min inactivity timeout must be mirrored in our app session layer; (3) org policy changes in our Settings (US-A7) must sync to Auth0 connections via Management API; (4) Log Stream is at-least-once webhook — idempotent ingestion + backfill from `GET /api/v2/logs` (short retention: ~1–10 days).
- Scaling cliffs: max ~100 DB connections on self-service (≈90 orgs), custom login UI (ACUL) is Enterprise-only. Cost: $150/mo (500 MAU floor) → ~$255–290/mo at 2,000 MAU.

### Supabase Auth Pro — runner-up
- Architecturally best audit: all auth calls proxied through our Next.js server routes → failures logged synchronously by us; per-org password/MFA/lockout policies enforced by our server directly from our settings tables (no sync layer). TOTP free, SAML cheap ($0.015/SSO-MAU). $25/mo.
- Costs: lockout, per-org MFA enforcement (via `aal2` claim), and org binding (Custom Access Token hook stamping `org_id`) are all OUR code — more to test and defend in validation. No organisations primitive. Identity lives in a second, Supabase-hosted Postgres outside the Azure stack. Enterprise SSO is SAML-only (no OIDC). Vendor verification hooks gated behind Team plan ($599/mo); the server-proxy pattern avoids needing them.

### Entra External ID — fails the spec as written
- **No TOTP for customer users at all** (email OTP / SMS / passkey only) → AC 5 unmeetable without a Notion amendment (e.g., passkeys instead of TOTP — arguably stronger, but that is Ramazan's amendment to make, not a build-time choice).
- Password complexity fixed by Microsoft (8+ chars, 3-of-4 classes); per-org min length enforceable app-side only if we adopt the native-auth API (GA for web) with server-side calls — which is also the only way to see failed logins (else: Event Hub streaming preview via Lighthouse workaround + Graph polling, 7-day retention).
- Conditional Access in external tenants can only include All Users (groups exclude-only) → per-org MFA is inverted/clunky. No admin unlock API (unlock = forced password reset — AC 7 does permit restore-via-reset). Cheapest option (50k MAU free) and the natural SSO story.

### Clerk — disqualified
- Failed sign-in attempts and lockouts are not exposed as webhooks or queryable API below Enterprise tier → cannot satisfy AC 3/9 (invariant 1). Otherwise decent fit (configurable lockout + API unlock, custom flows, orgs primitive, $25/mo).

## Notes for whichever option is chosen
- We own the app session layer regardless (AC 8 inactivity timeout, AC 13 org binding) — the provider only authenticates identity.
- Organisations are OUR domain tables per ADR-1 in every scenario; the provider never becomes the org source of truth.

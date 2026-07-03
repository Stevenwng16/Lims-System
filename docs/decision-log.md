# Decision log

One line per fundamental implementation choice, **at the moment it is made** — anything that realises an ADR, shapes the data model, or a future developer would ask "why is this like this?" about. Story-level details don't belong here. This log feeds the validation package for accredited customers.

| Date | Decision | Why | Relates to |
|---|---|---|---|
| 3 Jul 2026 | Auth provider: **Supabase Auth (Pro plan)**, with every auth call proxied through our own Next.js server routes (no direct browser→Supabase auth calls) | server-proxy gives synchronous capture of every auth event incl. failed logins into our append-only audit log (invariant 1, US-A1 AC 3/9); per-org password policy, lockout counter and MFA requirement enforced server-side directly from our org settings (AC 4/5/7, invariant 7); TOTP included, lowest cost ($25/mo). Chosen over Auth0 (vendor-native AC coverage but $150+/mo, settings-sync layer, ~90-org connection cap) — full analysis in `docs/research/us-a1-auth-provider-options.md`. Accepted trade-offs: lockout/MFA-enforcement logic is our code to test & defend; enterprise SSO is SAML-only | US-A1 / ADR-1 |

# LIMS Supabase infrastructure (US-A1)

Everything Supabase-side is code in this repo — no dashboard clickops:

- `supabase/migrations/` — schema, append-only audit log, JWT org-claim hook, RLS.
- `supabase/config.toml` — auth settings (signups off, TOTP MFA, 600 s JWT, SMTP,
  password floor, token hook, email templates). Deployed via `supabase config push`.
- `.github/workflows/supabase-deploy.yml` — pushes both on merge to `main`.

## One-time bootstrap (the only manual steps)

1. Create the Supabase project (once):
   ```sh
   supabase login
   supabase projects create lims --org-id <your-org> --region <region> \
     --db-password "$(openssl rand -base64 24)"
   ```
2. In the GitHub repo, set **secrets**: `SUPABASE_ACCESS_TOKEN` (from
   https://supabase.com/dashboard/account/tokens), `SUPABASE_PROJECT_ID` (project ref),
   `SUPABASE_DB_PASSWORD`, `SMTP_PASS` — and **variables**: `SITE_URL`,
   `RESET_REDIRECT_URL`, `SMTP_HOST`, `SMTP_USER`, `SMTP_ADMIN_EMAIL`.
3. Store the project's `service_role` key in the **app server's** secret store
   (it is used by the auth proxy, not by this pipeline).

## Local development

```sh
supabase start        # local stack with the same config.toml + migrations
supabase db reset     # replay all migrations from scratch
```

## Deploying changes

Schema change → new file in `supabase/migrations/` (never edit an applied one):
```sh
supabase migration new <name>
```
Auth setting change → edit `config.toml`. Merge to `main` and the workflow applies both.

## What stays outside this repo

- The auth **proxy** (login/lockout/MFA/session/audit endpoints) — application code.
- Per-org runtime settings — rows in `org_settings`, managed in-app (US-A7).
- Org provisioning / seeded admin (US-A2) — application code calling the admin API.

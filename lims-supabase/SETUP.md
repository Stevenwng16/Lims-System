# Supabase Deployment Pipeline — Setup Guide

This repo deploys the LIMS auth setup (database migrations, auth config, and email
templates) to a hosted Supabase project via GitHub Actions. Every push to `master`
that touches `lims-supabase/supabase/**` runs
[.github/workflows/supabase-deploy.yml](../.github/workflows/supabase-deploy.yml),
which does:

1. `supabase link` — connects the CI runner to your Supabase project
2. `supabase db push` — applies any new migrations in `supabase/migrations/`
3. `supabase config push` — syncs `supabase/config.toml` (auth settings, SMTP,
   MFA, token hook) and the email templates in `supabase/templates/`

Pull requests that touch `supabase/**` instead run a **validate** job that
replays all migrations against a clean local Supabase instance, so broken SQL
is caught before merge.

## 1. Prerequisites

- A Supabase account and organization: https://supabase.com/dashboard
- This repo pushed to GitHub
- (Optional, for local testing) the Supabase CLI: `brew install supabase/tap/supabase`

## 2. Create / identify your Supabase project

1. In the [Supabase dashboard](https://supabase.com/dashboard), open your
   organization and create a project (or use an existing one).
2. Note the **project ref** — the short id in the project URL:
   `https://supabase.com/dashboard/project/<PROJECT_REF>`.
3. Note the **database password** you set when creating the project
   (resettable under *Project Settings → Database* if lost).

## 3. Create a Supabase access token

The CI runner authenticates with a personal access token:

1. Go to https://supabase.com/dashboard/account/tokens
2. **Generate new token**, name it e.g. `github-actions-lims`
3. Copy it — it is shown only once.

## 4. Configure GitHub secrets and variables

In your GitHub repo: **Settings → Secrets and variables → Actions**.

### Secrets (Secrets tab → "New repository secret")

| Secret | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | The token from step 3 |
| `SUPABASE_PROJECT_ID` | Your project ref from step 2 |
| `SUPABASE_DB_PASSWORD` | The database password from step 2 |
| `SMTP_PASS` | SMTP password / API key |

### Variables (Variables tab → "New repository variable")

These fill the `env(...)` placeholders in `supabase/config.toml`:

| Variable | Example | Purpose |
|---|---|---|
| `SITE_URL` | `https://lims.example.com` | Auth `site_url` — where reset links land |
| `RESET_REDIRECT_URL` | `https://lims.example.com/reset-password` | Allowed redirect for password reset |
| `SMTP_HOST` | `smtp.resend.com` | Production mail server |
| `SMTP_USER` | `resend` | SMTP username for your mail provider |
| `SMTP_ADMIN_EMAIL` | `noreply@example.com` | Sender address for auth emails |

> The workflow also targets a GitHub **environment** named `production`. Create it
> under *Settings → Environments* (it can be empty), or if you prefer, define the
> secrets/variables on that environment instead of at the repo level — environment
> values take precedence and let you add required reviewers as a deploy gate.

## 5. First deploy

Push to `master` (or run the workflow manually via *Actions → Deploy to Supabase →
Run workflow*). Check the run logs: you should see the three migrations applied
and the config diff pushed.

## 6. Verify

- *Dashboard → Database → Migrations* lists the three migrations
- *Dashboard → Authentication → Sign In / Up* shows signup disabled
- *Dashboard → Authentication → Emails* shows the branded recovery/invite templates
- *Dashboard → Authentication → Hooks* shows the custom access token hook enabled

## Day-to-day workflow

- **New migration:** add a timestamped SQL file to `supabase/migrations/`
  (e.g. `supabase migration new my_change` locally), commit, push to `master`.
- **Auth config change:** edit `supabase/config.toml`, push to `master`.
  No dashboard clickops — the repo is the source of truth.
- **Email template change:** edit files in `supabase/templates/`, push to `master`.

## Local development (optional)

```sh
supabase start          # local stack (requires Docker)
supabase db reset       # apply all migrations locally
supabase stop
```

To run pushes manually against the hosted project:

```sh
export SUPABASE_ACCESS_TOKEN=...   # plus the SITE_URL/SMTP_* vars above
supabase link --project-ref <PROJECT_REF>
supabase db push
supabase config push
```

## Troubleshooting

- **`supabase link` fails:** check `SUPABASE_ACCESS_TOKEN` and
  `SUPABASE_PROJECT_REF`; the token must belong to a user with access to the
  project's organization.
- **`config push` complains about missing env:** one of the `SITE_URL` /
  `RESET_REDIRECT_URL` / `SMTP_*` values isn't set in GitHub variables/secrets.
- **Migration conflict:** never edit an already-deployed migration file; add a
  new migration instead. `supabase migration list` shows local vs remote state.

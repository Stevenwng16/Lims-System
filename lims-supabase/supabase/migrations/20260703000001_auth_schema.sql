-- US-A1 authentication backend: tenants, settings, profiles, attempts.

create table organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table org_settings (
  org_id                  uuid primary key references organisations(id),
  password_min_length     int  not null default 12,        -- AC 4
  password_require_mixed  boolean not null default true,
  lockout_threshold       int  not null default 5,         -- AC 7
  session_timeout_minutes int  not null default 30,        -- AC 8
  mfa_required            boolean not null default false   -- AC 5
);

create table user_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid not null references organisations(id),
  role       text not null check (role in ('admin','user')),
  locked_at  timestamptz,                                  -- AC 7
  created_at timestamptz not null default now()
);
create index user_profiles_org_idx on user_profiles (org_id);

create table login_attempts (
  id       bigint generated always as identity primary key,
  email    text not null,
  user_id  uuid,
  org_id   uuid,
  success  boolean not null,
  at       timestamptz not null default now()
);
create index login_attempts_email_idx on login_attempts (email, at desc);

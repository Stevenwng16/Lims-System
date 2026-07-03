-- AC 13 / invariant 5: org claim in JWT + row-level security tenant binding.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable
security definer set search_path = public as $$
declare
  claims jsonb := event->'claims';
  v_org  uuid;
  v_role text;
begin
  select org_id, role into v_org, v_role
  from public.user_profiles
  where user_id = (event->>'user_id')::uuid;

  claims := jsonb_set(claims, '{app_org_id}', to_jsonb(coalesce(v_org::text, '')));
  claims := jsonb_set(claims, '{app_role}',   to_jsonb(coalesce(v_role, '')));
  return jsonb_set(event, '{claims}', claims);
end $$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant select on public.user_profiles to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- RLS: every tenant table is bound to the session's org claim.
alter table user_profiles enable row level security;
create policy org_isolation on user_profiles
  for all
  using      (org_id = (auth.jwt()->>'app_org_id')::uuid)
  with check (org_id = (auth.jwt()->>'app_org_id')::uuid);

alter table org_settings enable row level security;
create policy org_isolation on org_settings
  for select
  using (org_id = (auth.jwt()->>'app_org_id')::uuid);

alter table organisations enable row level security;
create policy org_isolation on organisations
  for select
  using (id = (auth.jwt()->>'app_org_id')::uuid);

-- Written only by the server (service role bypasses RLS); no client policies.
alter table login_attempts enable row level security;
alter table audit_log      enable row level security;

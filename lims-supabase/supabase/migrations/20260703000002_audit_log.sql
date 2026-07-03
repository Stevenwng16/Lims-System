-- AC 9 / ADR-1: append-only audit log.

create table audit_log (
  id         bigint generated always as identity primary key,
  user_id    uuid,
  org_id     uuid,
  event_type text not null check (event_type in
    ('login_success','login_failure','logout','lockout',
     'password_change','mfa_enrolment','account_unlock','reset_triggered')),
  at         timestamptz not null default now(),
  detail     jsonb
);
create index audit_log_org_idx on audit_log (org_id, at desc);

create or replace function forbid_audit_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

create trigger audit_log_immutable
  before update or delete on audit_log
  for each row execute function forbid_audit_mutation();

revoke update, delete on audit_log from anon, authenticated;

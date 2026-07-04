-- One-time bootstrap: first organisation + admin profile.
-- Run in the Supabase SQL Editor AFTER creating the auth user
-- (Authentication → Users → Add user, auto-confirmed).
-- Replace the org name and email below.

with org as (
  insert into organisations (name)
  values ('Demo Lab')
  returning id
),
settings as (
  insert into org_settings (org_id)
  select id from org
)
insert into user_profiles (user_id, org_id, role)
select u.id, org.id, 'admin'
from org
join auth.users u on u.email = 'stevenwng16@gmail.com';

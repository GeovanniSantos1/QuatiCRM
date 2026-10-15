-- Profiles were historically lazy-created. Preserve auth accounts that predate
-- the approval rollout, including ones whose first profile was just created.
insert into profiles(user_id,full_name,email,role,active,registration_status)
select u.id,u.name,u.email,'user',true,'aprovado'
from "user" u cross join _migrations m
where m.name='0005_resident_registrations.sql' and u."createdAt"<m.applied_at
on conflict(user_id) do nothing;

update profiles p set registration_status='aprovado',active=true
from "user" u,_migrations m
where m.name='0005_resident_registrations.sql' and u.id=p.user_id
  and u."createdAt"<m.applied_at and p.created_at>=m.applied_at
  and p.registration_status='pendente' and p.registration_requested_at is null
  and p.registration_version=0 and p.role='user';

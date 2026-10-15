-- Existing residents retain their current access. New profiles require review.
alter table profiles add column if not exists registration_status text not null default 'aprovado';
alter table profiles alter column registration_status set default 'pendente';
alter table profiles alter column active set default false;
alter table profiles add column if not exists registration_requested_at timestamptz;
alter table profiles add column if not exists registration_reviewed_at timestamptz;
alter table profiles add column if not exists registration_reviewed_by text references profiles(user_id);
alter table profiles add column if not exists registration_rejection_reason text not null default '';
alter table profiles add column if not exists registration_version integer not null default 0;
alter table profiles add constraint profiles_registration_status_check check (registration_status in ('pendente','aprovado','recusado'));
alter table profiles add constraint profiles_registration_access_check check (registration_status = 'aprovado' or not active);
alter table profiles add constraint profiles_registration_rejection_check check (registration_status <> 'recusado' or length(trim(registration_rejection_reason)) between 3 and 300);
create index if not exists profiles_registration_idx on profiles(registration_status, registration_requested_at desc);

create table if not exists resident_invitations (
  id text primary key,
  full_name text not null,
  email text not null check (email = lower(trim(email))),
  unit text not null check (length(trim(unit)) between 1 and 40),
  phone text not null,
  token_hash text not null unique,
  status text not null default 'pendente' check (status in ('pendente','utilizado','revogado')),
  created_by text not null references profiles(user_id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by text references profiles(user_id),
  accepted_at timestamptz
);
create unique index if not exists resident_invitation_pending_email on resident_invitations(email) where status = 'pendente';

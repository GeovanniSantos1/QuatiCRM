-- One pending/approved vehicle per apartment, including concurrent requests.
create or replace function quati_unit_key(value text) returns text
language sql immutable strict parallel safe as $$
  select regexp_replace(upper(translate(value,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')), '[^A-Z0-9]', '', 'g')
$$;

create table if not exists vehicles (
  id text primary key,
  resident_user_id text not null references profiles(user_id),
  unit text not null,
  unit_key text generated always as (quati_unit_key(unit)) stored,
  plate text not null check (plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  model text not null check (length(trim(model)) between 2 and 80),
  color text not null check (length(trim(color)) between 2 and 30),
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado', 'cancelado')),
  rejection_reason text not null default '',
  reviewed_by text references profiles(user_id),
  reviewed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (unit_key <> ''),
  check (status <> 'recusado' or length(trim(rejection_reason)) between 3 and 300),
  check (status not in ('aprovado', 'recusado') or (reviewed_by is not null and reviewed_at is not null))
);

create unique index if not exists vehicles_one_per_unit on vehicles(unit_key) where status in ('pendente', 'aprovado');
create unique index if not exists vehicles_one_per_plate on vehicles(plate) where status in ('pendente', 'aprovado');
create unique index if not exists vehicles_one_per_resident on vehicles(resident_user_id) where status in ('pendente', 'aprovado');
create index if not exists vehicles_history_idx on vehicles(resident_user_id, created_at desc);
create index if not exists vehicles_pending_idx on vehicles(status, created_at desc);

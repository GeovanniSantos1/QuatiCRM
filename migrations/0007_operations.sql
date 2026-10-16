create table if not exists condo_tickets (
  id text primary key, resident_user_id text not null references profiles(user_id),
  unit text not null default '', title text not null check(length(title) between 5 and 120),
  description text not null check(length(description) between 10 and 3000),
  category text not null check(category in ('manutencao','limpeza','seguranca','convivencia','outro')),
  priority text not null check(priority in ('baixa','normal','alta')),
  status text not null default 'aberto' check(status in ('aberto','em_andamento','resolvido','cancelado')),
  version integer not null default 0, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists condo_tickets_resident_idx on condo_tickets(resident_user_id,created_at desc);
create table if not exists ticket_messages (
  id text primary key, ticket_id text not null references condo_tickets(id) on delete cascade,
  author_id text not null references profiles(user_id), body text not null check(length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create table if not exists ticket_events (
  id text primary key, ticket_id text not null references condo_tickets(id) on delete cascade,
  author_id text not null references profiles(user_id), status text not null, note text not null,
  created_at timestamptz not null default now()
);
create index if not exists ticket_messages_ticket_idx on ticket_messages(ticket_id,created_at);
create index if not exists ticket_events_ticket_idx on ticket_events(ticket_id,created_at);

create table if not exists common_areas (
  id text primary key, name text not null unique check(length(name) between 3 and 80),
  description text not null default '' check(length(description)<=500),
  capacity integer not null check(capacity between 1 and 500),
  opens integer not null check(opens between 0 and 1425 and opens%15=0),
  closes integer not null check(closes between 15 and 1440 and closes%15=0),
  active boolean not null default true, check(closes>opens)
);
create table if not exists reservations (
  id text primary key, area_id text not null references common_areas(id),
  resident_user_id text not null references profiles(user_id), unit text not null,
  booked_on date not null, start_minutes integer not null, end_minutes integer not null,
  purpose text not null check(length(purpose) between 3 and 160), guests integer not null check(guests>0),
  status text not null default 'pendente' check(status in ('pendente','aprovado','recusado','cancelado')),
  reason text not null default '', version integer not null default 0,
  reviewed_by text references profiles(user_id), created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(start_minutes>=0 and end_minutes<=1440 and end_minutes>start_minutes
    and start_minutes%15=0 and end_minutes%15=0)
);
create index if not exists reservations_resident_idx on reservations(resident_user_id,booked_on);
create index if not exists reservations_date_idx on reservations(booked_on,area_id);
create table if not exists reservation_slots (
  area_id text not null references common_areas(id), booked_on date not null, minute integer not null,
  reservation_id text not null references reservations(id) on delete cascade,
  primary key(area_id,booked_on,minute)
);
create index if not exists reservation_slots_booking_idx on reservation_slots(reservation_id);

create or replace function quati_reservation_slots() returns trigger language plpgsql as $$
begin
  if TG_OP='UPDATE' then
    if OLD.status in ('pendente','aprovado') and NEW.status in ('pendente','aprovado')
      and OLD.area_id=NEW.area_id and OLD.booked_on=NEW.booked_on
      and OLD.start_minutes=NEW.start_minutes and OLD.end_minutes=NEW.end_minutes then
      return NEW;
    end if;
    delete from reservation_slots where reservation_id=NEW.id;
  end if;
  if NEW.status in ('pendente','aprovado') then
    insert into reservation_slots(area_id,booked_on,minute,reservation_id)
    select NEW.area_id,NEW.booked_on,minute,NEW.id
    from generate_series(NEW.start_minutes,NEW.end_minutes-15,15) minute;
  end if;
  return NEW;
end $$;
drop trigger if exists quati_reservation_slots_trigger on reservations;
create trigger quati_reservation_slots_trigger after insert or update of status,area_id,booked_on,start_minutes,end_minutes on reservations
  for each row execute function quati_reservation_slots();

create or replace function quati_cancel_future_reservations() returns trigger language plpgsql as $$
begin
  if not NEW.active or quati_unit_key(OLD.unit)<>quati_unit_key(NEW.unit) then
    update reservations set status='cancelado',version=version+1,updated_at=now(),
      reason='Cadastro desativado ou unidade alterada pela administração.'
    where resident_user_id=NEW.user_id and status in ('pendente','aprovado')
      and ((booked_on+make_interval(mins=>end_minutes)) at time zone 'America/Sao_Paulo')>now();
  end if;
  return NEW;
end $$;
drop trigger if exists quati_cancel_reservations_profile on profiles;
create trigger quati_cancel_reservations_profile after update of active,unit on profiles
  for each row execute function quati_cancel_future_reservations();

-- Condomínio Quati: moradores, portaria, enquetes e caixa.

create table if not exists profiles (
  user_id    text primary key,
  full_name  text not null default '',
  email      text not null default '',
  phone      text not null default '',
  unit       text not null default '',
  role       text not null default 'user' check (role in ('user', 'porteiro', 'admin', 'sindico')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_one_sindico
  on profiles (role) where role = 'sindico';

create table if not exists deliveries (
  id                text primary key,
  resident_user_id  text not null,
  unit              text not null,
  recipient_name    text not null,
  carrier           text not null default '',
  tracking_code     text not null default '',
  description       text not null default '',
  photo_data        text,
  status            text not null default 'recebida'
                    check (status in ('recebida', 'notificada', 'assinada', 'retirada')),
  received_by       text not null,
  received_at       timestamptz not null default now(),
  notified_at       timestamptz,
  signed_at         timestamptz,
  signature_data    text,
  signer_name       text not null default '',
  picked_up_at      timestamptz,
  sign_token        text not null unique,
  whatsapp_body     text not null default ''
);

create index if not exists deliveries_resident_idx on deliveries (resident_user_id, received_at desc);
create index if not exists deliveries_status_idx on deliveries (status);

create table if not exists polls (
  id          text primary key,
  title       text not null,
  description text not null default '',
  created_by  text not null,
  status      text not null default 'aberta' check (status in ('aberta', 'encerrada')),
  closes_at   timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists poll_options (
  id       text primary key,
  poll_id  text not null references polls (id) on delete cascade,
  label    text not null,
  position integer not null default 0
);

create index if not exists poll_options_poll_idx on poll_options (poll_id, position);

create table if not exists poll_ballots (
  id        text primary key,
  poll_id   text not null references polls (id) on delete cascade,
  user_id   text not null,
  unit      text not null,
  token     text not null unique,
  option_id text,
  voted_at  timestamptz,
  unique (poll_id, user_id)
);

create unique index if not exists poll_ballots_one_vote_per_unit
  on poll_ballots (poll_id, unit) where voted_at is not null;

create index if not exists poll_ballots_poll_idx on poll_ballots (poll_id);

create table if not exists expenses (
  id            text primary key,
  title         text not null,
  category      text not null,
  amount_cents  integer not null check (amount_cents > 0),
  spent_on      date not null,
  vendor        text not null default '',
  notes         text not null default '',
  receipt_data  text,
  uploaded_by   text not null,
  created_at    timestamptz not null default now()
);

create index if not exists expenses_spent_on_idx on expenses (spent_on desc);

create table if not exists finance_settings (
  id                    integer primary key default 1 check (id = 1),
  monthly_budget_cents  integer not null default 0,
  reserve_cents         integer not null default 0,
  updated_by            text,
  updated_at            timestamptz not null default now()
);

insert into finance_settings (id) values (1) on conflict (id) do nothing;

create table if not exists notifications (
  id         text primary key,
  user_id    text not null,
  kind       text not null,
  title      text not null,
  body       text not null,
  link_path  text not null default '',
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

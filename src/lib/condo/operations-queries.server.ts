import type { Sql } from "../db";
type TicketInput = { title: string; description: string; category: string; priority: string };
type TicketChange = { id: string; version: number; status: string; note: string };
type BookingInput = {
  areaId: string;
  date: string;
  start: number;
  end: number;
  purpose: string;
  guests: number;
};
type BookingChange = { id: string; version: number; status: string; reason: string };
type AreaInput = {
  id: string;
  name: string;
  description: string;
  capacity: number;
  opens: number;
  closes: number;
  active: boolean;
};

export async function insertTicket(sql: Sql, actor: string, data: TicketInput) {
  const id = crypto.randomUUID();
  return sql<{ id: string }>`with created as (
    insert into condo_tickets(id,resident_user_id,unit,title,description,category,priority)
    select ${id},p.user_id,p.unit,${data.title},${data.description},${data.category},${data.priority}
    from profiles p where p.user_id=${actor} and p.active and p.registration_status='aprovado'
    returning *
  ), event as (
    insert into ticket_events(id,ticket_id,author_id,status,note)
    select ${crypto.randomUUID()},id,resident_user_id,'aberto','Chamado aberto.' from created
  ), notified as (
    insert into notifications(id,user_id,kind,title,body,link_path)
    select c.id||':'||p.user_id,p.user_id,'chamado','Novo chamado',c.title,'/chamados' from created c cross join profiles p
    where p.active and p.registration_status='aprovado' and p.role in ('admin','sindico') and p.user_id<>${actor}
  ) select id from created`;
}

export async function addTicketMessage(sql: Sql, actor: string, id: string, body: string) {
  const messageId = crypto.randomUUID();
  return sql<{ id: string }>`with allowed as materialized (
    select t.* from condo_tickets t join profiles p on p.user_id=${actor}
    where t.id=${id} and p.active and p.registration_status='aprovado'
    and (t.resident_user_id=p.user_id or p.role in ('admin','sindico'))
    and t.status in ('aberto','em_andamento') for update of t
  ), sent as (
    insert into ticket_messages(id,ticket_id,author_id,body)
    select ${messageId},id,${actor},${body} from allowed returning id
  ), notified as (
    insert into notifications(id,user_id,kind,title,body,link_path)
    select s.id||':'||p.user_id,p.user_id,'chamado','Nova mensagem no chamado',t.title,'/chamados'
    from sent s cross join allowed t cross join profiles p where p.active and p.registration_status='aprovado'
    and p.user_id<>${actor} and (p.user_id=t.resident_user_id or p.role in ('admin','sindico'))
  ) select id from sent`;
}

export async function changeTicket(sql: Sql, actor: string, data: TicketChange) {
  return sql<{ id: string }>`with changed as (
    update condo_tickets t set status=${data.status},version=version+1,updated_at=now()
    where t.id=${data.id} and t.version=${data.version} and t.status<>${data.status}
    and exists(select 1 from profiles p where p.user_id=${actor} and p.active and p.registration_status='aprovado'
      and (p.role in ('admin','sindico') or (t.resident_user_id=p.user_id and t.status='aberto' and ${data.status}='cancelado')))
    returning t.*
  ), event as (
    insert into ticket_events(id,ticket_id,author_id,status,note)
    select ${crypto.randomUUID()},id,${actor},status,${data.note} from changed
  ), notified as (
    insert into notifications(id,user_id,kind,title,body,link_path)
    select c.id||':status:'||c.version||':'||p.user_id,p.user_id,'chamado','Chamado atualizado',c.title,'/chamados'
    from changed c cross join profiles p where p.active and p.registration_status='aprovado' and p.user_id<>${actor}
    and (p.user_id=c.resident_user_id or p.role in ('admin','sindico'))
  ) select id from changed`;
}

export async function saveCommonArea(sql: Sql, actor: string, data: AreaInput) {
  return sql<{
    id: string;
  }>`insert into common_areas(id,name,description,capacity,opens,closes,active)
    select ${data.id || crypto.randomUUID()},${data.name},${data.description},${data.capacity},${data.opens},${data.closes},${data.active}
    where exists(select 1 from profiles p where p.user_id=${actor} and p.active and p.registration_status='aprovado' and p.role in ('admin','sindico'))
    on conflict(id) do update set name=excluded.name,description=excluded.description,capacity=excluded.capacity,
    opens=excluded.opens,closes=excluded.closes,active=excluded.active returning id`;
}

export async function insertBooking(sql: Sql, actor: string, data: BookingInput) {
  // Profile/area locks also serialize profile changes and area configuration changes.
  return sql<{ id: string }>`with resident as materialized (
    select * from profiles where user_id=${actor} and active and registration_status='aprovado'
    and role<>'porteiro' and quati_unit_key(unit)<>'' for update
  ), area as materialized (
    select * from common_areas where id=${data.areaId} and active for share
  ), created as (
    insert into reservations(id,area_id,resident_user_id,unit,booked_on,start_minutes,end_minutes,purpose,guests)
    select ${crypto.randomUUID()},a.id,p.user_id,p.unit,${data.date}::date,${data.start},${data.end},${data.purpose},${data.guests}
    from resident p cross join area a where ${data.start}>=a.opens and ${data.end}<=a.closes and ${data.guests}<=a.capacity
    and ${data.end}::int>${data.start}::int and ${data.end}::int-${data.start}::int<=720
    and ${data.date}::date<=(now() at time zone 'America/Sao_Paulo')::date+90
    and ((${data.date}::date+make_interval(mins=>${data.start})) at time zone 'America/Sao_Paulo')>now()
    returning *
  ), notified as (
    insert into notifications(id,user_id,kind,title,body,link_path)
    select c.id||':'||p.user_id,p.user_id,'reserva','Reserva para analisar',c.unit||' · '||c.booked_on,'/reservas'
    from created c cross join profiles p where p.active and p.registration_status='aprovado' and p.role in ('admin','sindico')
    and p.user_id<>${actor}
  ) select id from created`;
}

export async function changeBooking(sql: Sql, actor: string, data: BookingChange) {
  return sql<{ id: string }>`with changed as (
    update reservations r set status=${data.status},reason=${data.reason},version=version+1,reviewed_by=${actor},updated_at=now()
    where r.id=${data.id} and r.version=${data.version}
    and ((r.status='pendente' and ${data.status} in ('aprovado','recusado','cancelado'))
      or (r.status='aprovado' and ${data.status}='cancelado'))
    and ((r.booked_on+make_interval(mins=>r.start_minutes)) at time zone 'America/Sao_Paulo')>now()
    and exists(select 1 from profiles p where p.user_id=${actor} and p.active and p.registration_status='aprovado'
      and (p.role in ('admin','sindico') or (p.user_id=r.resident_user_id and ${data.status}='cancelado')))
    returning r.*
  ), notified as (
    insert into notifications(id,user_id,kind,title,body,link_path)
    select r.id||':status:'||r.version||':'||p.user_id,p.user_id,'reserva','Reserva atualizada',a.name||' · '||r.booked_on,'/reservas'
    from changed r join common_areas a on a.id=r.area_id cross join profiles p
    where p.active and p.registration_status='aprovado' and p.user_id<>${actor}
    and (p.user_id=r.resident_user_id or p.role in ('admin','sindico'))
  ) select id from changed`;
}

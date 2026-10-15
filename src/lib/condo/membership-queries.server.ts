import type { Sql } from "../db";
type Details = { fullName: string; unit: string; phone: string };
type Decision = {
  userId: string;
  version: number;
  decision: "aprovado" | "recusado";
  reason: string;
};

export async function saveResidentRequest(sql: Sql, userId: string, data: Details) {
  return sql<{ user_id: string; registration_version: number }>`
    with requested as (
      update profiles set full_name=${data.fullName}, unit=${data.unit}, phone=${data.phone},
        registration_status='pendente', active=false, registration_requested_at=now(),
        registration_reviewed_at=null, registration_reviewed_by=null, registration_rejection_reason='',
        registration_version=registration_version+1
      where user_id=${userId} and registration_status in ('pendente','recusado')
      returning user_id,full_name,unit,registration_version
    ), notified as (
      insert into notifications(id,user_id,kind,title,body,link_path)
      select q.user_id || ':member-pending:' || p.user_id,p.user_id,'morador','Cadastro de morador para analisar',
        q.full_name || ' · unidade ' || q.unit,'/moradores' from requested q cross join profiles p
      where p.active and p.registration_status='aprovado' and p.role in ('admin','sindico')
      on conflict(id) do update set body=excluded.body,created_at=now(),read_at=null
    ) select user_id,registration_version from requested
  `;
}

export async function decideResident(sql: Sql, actorId: string, data: Decision) {
  return sql<{ user_id: string }>`
    with invite_lock as materialized (
      select id from resident_invitations
      where email=(select lower(email) from profiles where user_id=${data.userId})
        and status='pendente' and ${data.decision}='recusado'
      for update
    ), reviewed as (
      update profiles set registration_status=${data.decision},active=${data.decision === "aprovado"},
        registration_reviewed_by=${actorId},registration_reviewed_at=now(),
        registration_rejection_reason=${data.decision === "recusado" ? data.reason : ""}
      where user_id=${data.userId} and registration_status='pendente' and registration_requested_at is not null
        and registration_version=${data.version}
        and (select count(*) from invite_lock)>=0
        and exists(select 1 from profiles a where a.user_id=${actorId} and a.active and a.registration_status='aprovado' and a.role in ('admin','sindico'))
      returning user_id
    ), revoked as (
      update resident_invitations set status='revogado'
      where id in (select id from invite_lock) and exists(select 1 from reviewed)
    ), notified as (
      insert into notifications(id,user_id,kind,title,body,link_path)
      select ${crypto.randomUUID()},user_id,'morador',${data.decision === "aprovado" ? "Cadastro de morador aprovado" : "Cadastro de morador recusado"},
        ${data.decision === "aprovado" ? "Seu acesso ao condomínio foi liberado." : data.reason},'/cadastro' from reviewed
    ) select user_id from reviewed
  `;
}

export async function createResidentInvitation(
  sql: Sql,
  actorId: string,
  data: Details & { email: string },
  hash: string,
) {
  return sql<{ id: string; expires_at: unknown }>`
    insert into resident_invitations(id,full_name,email,unit,phone,token_hash,created_by)
    select ${crypto.randomUUID()},${data.fullName},${data.email},${data.unit},${data.phone},${hash},${actorId}
    where exists(select 1 from profiles where user_id=${actorId} and active and registration_status='aprovado' and role in ('admin','sindico'))
      and not exists(select 1 from profiles where lower(email)=${data.email} and registration_status='aprovado')
    returning id,expires_at
  `;
}

export async function acceptResidentInvitation(sql: Sql, userId: string, hash: string) {
  return sql<{ user_id: string }>`
    with invitation as (
      select * from resident_invitations where token_hash=${hash} and status='pendente' and expires_at>now() for update
    ), eligible as (
      select p.user_id from profiles p join "user" u on u.id=p.user_id
      join invitation i on lower(u.email)=i.email
      where p.user_id=${userId} and p.registration_status in ('pendente','recusado') for update of p
    ), accepted as (
      update profiles p set full_name=i.full_name,unit=i.unit,phone=i.phone,role='user',active=true,
        registration_status='aprovado',registration_reviewed_by=i.created_by,registration_reviewed_at=now(),
        registration_requested_at=coalesce(p.registration_requested_at,now()),registration_rejection_reason='',registration_version=p.registration_version+1
      from invitation i,eligible e where p.user_id=e.user_id and p.registration_status in ('pendente','recusado')
      returning p.user_id
    ), consumed as (
      update resident_invitations set status='utilizado',accepted_by=${userId},accepted_at=now()
      where id in (select id from invitation) and exists(select 1 from accepted) returning id
    ) select user_id from accepted
  `;
}

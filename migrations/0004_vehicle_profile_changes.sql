-- Moving or disabling a resident must release the former apartment's slot.
alter table vehicles add column if not exists cancellation_reason text not null default '';

create or replace function quati_cancel_changed_profile_vehicles() returns trigger
language plpgsql as $$
declare reason text;
begin
  if not new.active or quati_unit_key(new.unit) is distinct from quati_unit_key(old.unit) then
    reason := case when not new.active then 'Cadastro cancelado porque o acesso do morador foi desativado.'
                   else 'Cadastro cancelado porque a unidade do morador foi alterada. Solicite um novo cadastro.' end;
    with cancelled as (
      update vehicles set status = 'cancelado', cancelled_at = now(), cancellation_reason = reason
      where resident_user_id = new.user_id and status in ('pendente', 'aprovado')
      returning id, resident_user_id, plate
    )
    insert into notifications (id, user_id, kind, title, body, link_path)
    select id || ':profile-cancel', resident_user_id, 'veiculo', 'Cadastro de veículo cancelado',
           plate || ' · ' || reason, '/veiculos' from cancelled;
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_cancel_on_profile_change on profiles;
create trigger vehicles_cancel_on_profile_change after update of unit, active on profiles
for each row execute function quati_cancel_changed_profile_vehicles();

-- Release stale registrations created before the lifecycle trigger existed.
with cancelled as (
  update vehicles v set status = 'cancelado', cancelled_at = now(),
    cancellation_reason = 'Cadastro cancelado porque a unidade ou o acesso do morador foi alterado.'
  from profiles p where p.user_id = v.resident_user_id and v.status in ('pendente', 'aprovado')
    and (not p.active or quati_unit_key(p.unit) is distinct from v.unit_key)
  returning v.id, v.resident_user_id, v.plate, v.cancellation_reason
)
insert into notifications (id, user_id, kind, title, body, link_path)
select id || ':profile-cancel', resident_user_id, 'veiculo', 'Cadastro de veículo cancelado',
       plate || ' · ' || cancellation_reason, '/veiculos' from cancelled;

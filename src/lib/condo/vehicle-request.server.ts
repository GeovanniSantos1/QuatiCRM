import type { Sql } from "../db";

/** Lock the resident until reservation and notifications commit. A concurrent
 * move/deactivation must either precede this read or cancel the committed row. */
export async function insertVehicleRequest(
  sql: Sql,
  userId: string,
  data: { plate: string; model: string; color: string },
) {
  return sql<{ id: string }>`
    with resident as (
      select user_id, unit from profiles
      where user_id = ${userId} and active and role <> 'porteiro' and quati_unit_key(unit) <> ''
      for update
    ), requested as (
      insert into vehicles (id, resident_user_id, unit, plate, model, color)
      select ${crypto.randomUUID()}, user_id, unit, ${data.plate}, ${data.model}, ${data.color}
      from resident returning id, unit, plate
    ), notified as (
      insert into notifications (id, user_id, kind, title, body, link_path)
      select ${crypto.randomUUID()} || ':' || p.user_id, p.user_id, 'veiculo', 'Novo veículo para analisar',
        'Unidade ' || v.unit || ' · placa ' || v.plate, '/veiculos'
      from requested v cross join profiles p where p.active and p.role in ('admin', 'sindico')
    ) select id from requested
  `;
}

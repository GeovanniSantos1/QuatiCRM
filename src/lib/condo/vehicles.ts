import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireProfile } from "@/lib/condo/api";
import { insertVehicleRequest } from "@/lib/condo/vehicle-request.server";
import {
  canConsultVehicles,
  canReviewVehicles,
  normalizeUnit,
  plateInput,
  vehicleInput,
  type VehicleStatus,
} from "@/lib/condo/vehicle-rules";

type VehicleRow = {
  id: string;
  resident_user_id: string;
  unit: string;
  plate: string;
  model: string;
  color: string;
  status: VehicleStatus;
  rejection_reason: string;
  cancellation_reason: string;
  created_at: unknown;
  reviewed_at: unknown;
  resident_name: string;
  reviewer_name: string | null;
};
function date(value: unknown) {
  return value instanceof Date ? value.toISOString() : value == null ? null : String(value);
}
function mapVehicle(row: VehicleRow, userId: string) {
  return {
    id: row.id,
    unit: row.unit,
    plate: row.plate,
    model: row.model,
    color: row.color,
    status: row.status,
    rejectionReason: row.rejection_reason,
    cancellationReason: row.cancellation_reason || "",
    createdAt: date(row.created_at),
    reviewedAt: date(row.reviewed_at),
    residentName: row.resident_name,
    reviewerName: row.reviewer_name,
    mine: row.resident_user_id === userId,
  };
}
function parse<T>(schema: z.ZodType<T>) {
  return (input: unknown) => {
    const result = schema.safeParse(input);
    if (!result.success) throw new Error(result.error.issues[0]?.message || "Dados inválidos.");
    return result.data;
  };
}

export const listVehicles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, profile } = await requireProfile(context.userId);
    const rows =
      profile.role === "porteiro"
        ? []
        : await sql<VehicleRow>`
    select v.*, p.full_name as resident_name, r.full_name as reviewer_name
    from vehicles v join profiles p on p.user_id = v.resident_user_id
    left join profiles r on r.user_id = v.reviewed_by
    where v.resident_user_id = ${context.userId} or ${canReviewVehicles(profile.role)}
    order by (v.status = 'pendente') desc, v.created_at desc limit 100
  `;
    const occupied = await sql<{
      n: number;
    }>`select count(*) as n from vehicles where unit_key = quati_unit_key(${profile.unit}) and status in ('pendente', 'aprovado')`;
    const ownRows = canReviewVehicles(profile.role)
      ? await sql<VehicleRow>`
    select v.*, p.full_name as resident_name, r.full_name as reviewer_name from vehicles v
    join profiles p on p.user_id = v.resident_user_id left join profiles r on r.user_id = v.reviewed_by
    where v.resident_user_id = ${context.userId} order by v.created_at desc limit 20
  `
      : rows;
    return {
      me: profile,
      unitOccupied: Number(occupied[0]?.n || 0) > 0,
      vehicles: rows.map((row) => mapVehicle(row, context.userId)),
      ownVehicles: ownRows.map((row) => mapVehicle(row, context.userId)),
    };
  });

export const requestVehicle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(vehicleInput))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    if (profile.role === "porteiro")
      throw new Error("O cadastro deve ser solicitado pelo morador.");
    if (!normalizeUnit(profile.unit))
      throw new Error("Complete sua unidade em Pessoas antes de solicitar.");
    try {
      const created = await insertVehicleRequest(sql, context.userId, data);
      if (!created[0])
        throw new Error("Seu acesso foi alterado. Atualize a página antes de solicitar.");
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        throw new Error(
          "Já existe uma solicitação pendente ou veículo aprovado para este apartamento, morador ou placa. Cancele o cadastro anterior antes de solicitar outro.",
        );
      }
      throw err;
    }
    return { ok: true };
  });

export const reviewVehicle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    parse(
      z.object({
        id: z.string().min(1),
        decision: z.enum(["aprovado", "recusado"]),
        reason: z.string().trim().max(300).default(""),
      }),
    ),
  )
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    if (!canReviewVehicles(profile.role))
      throw new Error("Só admin e síndico podem aprovar ou recusar veículos.");
    if (data.decision === "recusado" && data.reason.length < 3)
      throw new Error("Informe o motivo da recusa (mínimo de 3 caracteres).");
    const result = await sql<{ id: string }>`
    with reviewed as (
      update vehicles v set status = ${data.decision}, rejection_reason = ${data.decision === "recusado" ? data.reason : ""},
        reviewed_by = ${context.userId}, reviewed_at = now()
      from profiles p where v.id = ${data.id} and v.status = 'pendente' and p.user_id = v.resident_user_id
        and (${data.decision} = 'recusado' or (p.active and quati_unit_key(p.unit) = v.unit_key))
      returning v.id, v.resident_user_id, v.plate
    ), notified as (
      insert into notifications (id, user_id, kind, title, body, link_path)
      select ${crypto.randomUUID()}, resident_user_id, 'veiculo', ${data.decision === "aprovado" ? "Veículo aprovado" : "Cadastro de veículo recusado"},
        plate || ' · ' || ${data.decision === "aprovado" ? "Entrada liberada na portaria." : data.reason}, '/veiculos' from reviewed
    ) select id from reviewed
  `;
    if (!result[0])
      throw new Error(
        "A solicitação já foi analisada, cancelada ou o morador mudou de unidade/acesso. Atualize a lista.",
      );
    return { ok: true };
  });

export const cancelVehicle = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ id: z.string().min(1) })))
  .handler(async ({ context, data }) => {
    const { sql } = await requireProfile(context.userId);
    const rows = await sql<{
      id: string;
    }>`update vehicles set status = 'cancelado', cancelled_at = now(), cancellation_reason = 'Cadastro cancelado pelo morador.'
    where id = ${data.id} and resident_user_id = ${context.userId} and status in ('pendente', 'aprovado') returning id`;
    if (!rows[0]) throw new Error("Cadastro não encontrado ou já encerrado.");
    return { ok: true };
  });

export const lookupVehicle = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ plate: plateInput })))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    if (!canConsultVehicles(profile.role))
      throw new Error("Consulta de placas disponível apenas para portaria, admin e síndico.");
    const rows = await sql<
      VehicleRow & { owner_active: boolean; current_unit_key: string; unit_key: string }
    >`
    select v.*, p.full_name as resident_name, p.active as owner_active, quati_unit_key(p.unit) as current_unit_key,
      r.full_name as reviewer_name
    from vehicles v join profiles p on p.user_id = v.resident_user_id left join profiles r on r.user_id = v.reviewed_by
    where v.plate = ${data.plate}
    order by (v.status in ('pendente', 'aprovado')) desc, v.created_at desc limit 1
  `;
    const row = rows[0];
    if (!row)
      return {
        allowed: false,
        reason: "Placa não cadastrada. Entrada não liberada.",
        vehicle: null,
      };
    const allowed =
      row.status === "aprovado" && row.owner_active && row.unit_key === row.current_unit_key;
    const reason = allowed
      ? "Veículo aprovado pela administração."
      : !row.owner_active
        ? "O acesso do morador está desativado."
        : row.unit_key !== row.current_unit_key
          ? "A unidade do morador foi alterada. É necessário um novo cadastro."
          : row.status === "pendente"
            ? "Solicitação aguardando aprovação."
            : row.status === "recusado"
              ? "Cadastro recusado pela administração."
              : row.cancellation_reason || "Cadastro cancelado.";
    return { allowed, reason, vehicle: mapVehicle(row, context.userId) };
  });

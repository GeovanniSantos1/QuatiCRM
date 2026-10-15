import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { readProfileAccess, requireProfile } from "@/lib/condo/api";
import {
  canManageResidents,
  invitationDetails,
  invitationToken,
  residentDetails,
  type RegistrationStatus,
} from "@/lib/condo/membership-rules";
import {
  acceptResidentInvitation,
  createResidentInvitation,
  decideResident,
  saveResidentRequest,
} from "@/lib/condo/membership-queries.server";

function parse<T>(schema: z.ZodType<T>) {
  return (value: unknown) => {
    const result = schema.safeParse(value);
    if (!result.success) throw new Error(result.error.issues[0]?.message || "Dados inválidos.");
    return result.data;
  };
}
function date(value: unknown) {
  return value instanceof Date ? value.toISOString() : value == null ? null : String(value);
}
async function newToken() {
  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  return { token, hash: await hashToken(token) };
}
async function hashToken(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const getMembershipAccess = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => readProfileAccess(await getSql(), context.userId));

export const submitResidentRegistration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(residentDetails))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await readProfileAccess(sql, context.userId);
    const rows = await saveResidentRequest(sql, context.userId, data);
    if (!rows[0])
      throw new Error("Este cadastro já foi aprovado. Atualize a página para continuar.");
    return { ok: true };
  });

export const listResidentAdministration = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, profile } = await requireProfile(context.userId);
    if (!canManageResidents(profile.role))
      throw new Error("Somente admin e síndico gerenciam os cadastros.");
    const requests = await sql<{
      user_id: string;
      full_name: string;
      email: string;
      phone: string;
      unit: string;
      registration_status: RegistrationStatus;
      registration_rejection_reason: string;
      registration_requested_at: unknown;
      registration_version: number;
    }>`
    select user_id,full_name,email,phone,unit,registration_status,registration_rejection_reason,registration_requested_at,registration_version
    from profiles where registration_requested_at is not null and registration_status in ('pendente','recusado')
    order by (registration_status='pendente') desc,registration_requested_at desc
  `;
    const invites = await sql<{
      id: string;
      full_name: string;
      email: string;
      unit: string;
      phone: string;
      status: string;
      created_at: unknown;
      expires_at: unknown;
      expired: boolean;
    }>`
    select id,full_name,email,unit,phone,status,created_at,expires_at,expires_at<=now() as expired
    from resident_invitations
    where status='pendente' or id in (select id from resident_invitations where status<>'pendente' order by created_at desc limit 100)
    order by (status='pendente') desc,created_at desc
  `;
    return {
      requests: requests.map((r) => ({
        userId: r.user_id,
        fullName: r.full_name,
        email: r.email,
        phone: r.phone,
        unit: r.unit,
        status: r.registration_status,
        reason: r.registration_rejection_reason,
        requestedAt: date(r.registration_requested_at),
        version: r.registration_version,
      })),
      invitations: invites.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        email: r.email,
        unit: r.unit,
        phone: r.phone,
        status: r.status,
        createdAt: date(r.created_at),
        expiresAt: date(r.expires_at),
        expired: r.expired,
      })),
    };
  });

export const reviewResidentRegistration = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    parse(
      z.object({
        userId: z.string().min(1),
        version: z.number().int().nonnegative(),
        decision: z.enum(["aprovado", "recusado"]),
        reason: z.string().trim().max(300).default(""),
      }),
    ),
  )
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    if (!canManageResidents(profile.role))
      throw new Error("Somente admin e síndico aprovam ou recusam moradores.");
    if (data.decision === "recusado" && data.reason.length < 3)
      throw new Error("Informe o motivo da recusa (mínimo de 3 caracteres).");
    const rows = await decideResident(sql, context.userId, data);
    if (!rows[0])
      throw new Error(
        "O cadastro foi alterado ou já analisado. Atualize a lista antes de decidir.",
      );
    return { ok: true };
  });

export const createResidentInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(invitationDetails))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    if (!canManageResidents(profile.role))
      throw new Error("Somente admin e síndico cadastram moradores.");
    const secret = await newToken();
    try {
      const rows = await createResidentInvitation(sql, context.userId, data, secret.hash);
      if (!rows[0])
        throw new Error(
          "Este e-mail já tem um cadastro aprovado. Use a lista de pessoas para gerenciá-lo.",
        );
      return { id: rows[0].id, token: secret.token, expiresAt: date(rows[0].expires_at) };
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new Error(
          "Já existe um convite para este e-mail. Gere um novo link na lista de convites.",
        );
      throw error;
    }
  });

export const manageResidentInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ id: z.string().min(1), action: z.enum(["renovar", "revogar"]) })))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    if (!canManageResidents(profile.role))
      throw new Error("Somente admin e síndico gerenciam convites.");
    const secret = await newToken();
    const rows =
      data.action === "revogar"
        ? await sql<{
            id: string;
            expires_at: unknown;
          }>`update resident_invitations set status='revogado' where id=${data.id} and status='pendente' returning id,expires_at`
        : await sql<{
            id: string;
            expires_at: unknown;
          }>`update resident_invitations set token_hash=${secret.hash},expires_at=now()+interval '7 days' where id=${data.id} and status='pendente' returning id,expires_at`;
    if (!rows[0]) throw new Error("O convite já foi utilizado ou revogado. Atualize a lista.");
    return {
      id: rows[0].id,
      token: data.action === "renovar" ? secret.token : null,
      expiresAt: date(rows[0].expires_at),
    };
  });

export const getResidentInvite = createServerFn({ method: "GET" })
  .validator(parse(z.object({ token: invitationToken })))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{
      full_name: string;
      email: string;
      unit: string;
      expires_at: unknown;
      status: string;
      expired: boolean;
    }>`select full_name,email,unit,expires_at,status,expires_at<=now() as expired from resident_invitations where token_hash=${await hashToken(data.token)}`;
    const row = rows[0];
    if (!row || row.status !== "pendente" || row.expired)
      throw new Error(
        "Este convite é inválido, expirou ou já foi utilizado. Peça um novo link à administração.",
      );
    const [name, domain] = row.email.split("@");
    return {
      fullName: row.full_name,
      emailHint: `${name.slice(0, 2)}***@${domain}`,
      unit: row.unit,
      expiresAt: date(row.expires_at),
    };
  });

export const acceptResidentInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ token: invitationToken })))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const access = await readProfileAccess(sql, context.userId);
    if (access.status === "aprovado")
      throw new Error(
        "Sua conta já possui um cadastro aprovado. Não é possível substituir o cadastro por um convite.",
      );
    const rows = await acceptResidentInvitation(sql, context.userId, await hashToken(data.token));
    if (!rows[0])
      throw new Error(
        "Não foi possível ativar. Entre com o e-mail que recebeu o convite e confira se o link ainda é válido.",
      );
    return { ok: true };
  });

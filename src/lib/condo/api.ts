import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import {
  asRole,
  canAssignRoles,
  canManagePolls,
  canPostExpense,
  canRegisterDelivery,
  type Role,
} from "@/lib/condo/roles";
import { deliveryMessage, firstName, pollMessage, waLink } from "@/lib/condo/format";
import { pollShare } from "@/lib/condo/poll-sharing";
import type { RegistrationStatus } from "@/lib/condo/membership-rules";
import { normalizeUnit } from "@/lib/condo/vehicle-rules";

export type Profile = {
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  unit: string;
  role: Role;
  active: boolean;
};

type ProfileRow = {
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  unit: string;
  role: string;
  active: boolean;
};

function mapProfile(row: ProfileRow): Profile {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    unit: row.unit,
    role: asRole(row.role),
    active: Boolean(row.active),
  };
}

function stamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function parse<T>(schema: z.ZodType<T>) {
  return (input: unknown): T => {
    const result = schema.safeParse(input);
    if (!result.success) {
      throw new Error(result.error.issues[0]?.message ?? "Dados inválidos");
    }
    return result.data;
  };
}

function token() {
  return crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
}

function safeOrigin(origin: string) {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("Não foi possível montar o link.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Não foi possível montar o link.");
  }
  return url.origin;
}

function assertImage(data: string, label: string, max: number) {
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i.test(data)) {
    throw new Error(`${label} inválido. Envie uma foto.`);
  }
  if (data.length > max) throw new Error(`${label} muito grande. Tire uma foto menor.`);
}

function brazilMonthRange(which: "current" | "previous" = "current") {
  const shifted = new Date(Date.now() - 3 * 60 * 60 * 1000);
  let year = shifted.getUTCFullYear();
  let month = shifted.getUTCMonth();
  if (which === "previous") {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-01`;
  return { start, end, label: start.slice(0, 7) };
}

export async function readProfileAccess(sql: Sql, userId: string) {
  const people = await sql<{ id: string; name: string; email: string }>`
    select id, name, email from "user" where id = ${userId}
  `;
  const person = people[0];
  if (!person) throw new Error("Sessão sem cadastro. Entre de novo.");
  const rows = await sql<
    ProfileRow & {
      registration_status: RegistrationStatus;
      registration_rejection_reason: string;
      registration_requested_at: unknown;
      registration_version: number;
    }
  >`
    insert into profiles (user_id, full_name, email)
    values (${userId}, ${person.name ?? ""}, ${person.email ?? ""})
    on conflict (user_id) do update set
      email = excluded.email,
      full_name = case when profiles.full_name = '' then excluded.full_name else profiles.full_name end
    returning user_id, full_name, email, phone, unit, role, active,registration_status,registration_rejection_reason,registration_requested_at,registration_version
  `;
  const profile = mapProfile(rows[0]);
  const row = rows[0];
  return {
    profile,
    status: row.registration_status,
    reason: row.registration_rejection_reason,
    requestedAt: stamp(row.registration_requested_at),
    version: row.registration_version,
  };
}

export async function requireProfile(userId: string) {
  const sql = await getSql();
  const access = await readProfileAccess(sql, userId);
  if (access.status !== "aprovado")
    throw new Error("Seu cadastro de morador ainda não foi aprovado pela administração.");
  const profile = access.profile;
  if (!profile.active) throw new Error("Seu acesso foi desativado pela administração.");
  return { sql, profile };
}

function forbid(ok: boolean, message = "Sem permissão para esta ação.") {
  if (!ok) throw new Error(message);
}

const originSchema = z.string().min(1, "Origem ausente");

export const bootstrap = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, profile } = await requireProfile(context.userId);
    const month = brazilMonthRange();
    const sindicos = await sql<{ full_name: string }>`
      select full_name from profiles where role = 'sindico' and active limit 1
    `;
    const openDeliveries = await sql<{ n: number }>`
      select count(*) as n from deliveries
      where status <> 'retirada'
        and (
          ${profile.role} <> 'user'
          or resident_user_id = ${profile.userId}
        )
    `;
    const openPolls = await sql<{ n: number }>`
      select count(*) as n from polls where status = 'aberta'
    `;
    const spent = await sql<{ n: number }>`
      select coalesce(sum(amount_cents), 0) as n from expenses
      where spent_on >= ${month.start} and spent_on < ${month.end}
    `;
    const settings = await sql<{ monthly_budget_cents: number; reserve_cents: number }>`
      select monthly_budget_cents, reserve_cents from finance_settings where id = 1
    `;
    const notes = await sql<{
      id: string;
      kind: string;
      title: string;
      body: string;
      link_path: string;
      created_at: unknown;
      read_at: unknown;
    }>`
      select id, kind, title, body, link_path, created_at, read_at
      from notifications
      where user_id = ${profile.userId}
      order by created_at desc
      limit 6
    `;
    await sql`
      update notifications set read_at = now()
      where user_id = ${profile.userId} and read_at is null
    `;
    const budget = settings[0]?.monthly_budget_cents ?? 0;
    const spentCents = Number(spent[0]?.n ?? 0);
    return {
      profile,
      sindicoName: sindicos[0]?.full_name ?? null,
      stats: {
        openDeliveries: Number(openDeliveries[0]?.n ?? 0),
        openPolls: Number(openPolls[0]?.n ?? 0),
        monthSpentCents: spentCents,
        budgetCents: budget,
        reserveCents: settings[0]?.reserve_cents ?? 0,
        monthLabel: month.label,
        health:
          budget <= 0
            ? "sem-orcamento"
            : spentCents / budget < 0.75
              ? "saudavel"
              : spentCents / budget < 1
                ? "atencao"
                : "acima",
      },
      notifications: notes.map((note) => ({
        id: note.id,
        kind: note.kind,
        title: note.title,
        body: note.body,
        linkPath: note.link_path,
        createdAt: stamp(note.created_at) ?? "",
        read: note.read_at != null,
      })),
    };
  });

const profileInput = z.object({
  fullName: z.string().trim().min(2, "Informe seu nome.").max(80),
  phone: z.string().trim().max(20),
  unit: z.string().trim().max(40),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(profileInput))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    if (
      profile.role === "user" &&
      profile.unit &&
      normalizeUnit(profile.unit) !== normalizeUnit(data.unit)
    ) {
      throw new Error(
        "Peça à administração para alterar sua unidade. O cadastro aprovado deve corresponder ao apartamento correto.",
      );
    }
    const rows = await sql<ProfileRow>`
      update profiles
      set full_name = ${data.fullName}, phone = ${data.phone}, unit = ${data.unit}
      where user_id = ${profile.userId}
      returning user_id, full_name, email, phone, unit, role, active
    `;
    return mapProfile(rows[0]);
  });

export const claimSindico = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, profile } = await requireProfile(context.userId);
    if (!profile.fullName || !profile.unit) {
      throw new Error("Complete nome e unidade antes de assumir o condomínio.");
    }
    const rows = await sql<{ user_id: string }>`
      update profiles set role = 'sindico'
      where user_id = ${profile.userId}
        and not exists (select 1 from profiles where role = 'sindico')
      returning user_id
    `;
    if (!rows[0]) throw new Error("Já existe um síndico. Peça para ele ajustar seu nível.");
    return { ok: true };
  });

export const listPeople = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, profile } = await requireProfile(context.userId);
    if (profile.role === "user") return { me: profile, people: [profile] };
    const rows = await sql<ProfileRow>`
      select user_id, full_name, email, phone, unit, role, active
      from profiles
      where registration_status = 'aprovado'
      order by unit asc, full_name asc
    `;
    return { me: profile, people: rows.map(mapProfile) };
  });

const residentPatch = z.object({
  userId: z.string().min(1),
  fullName: z.string().trim().min(2, "Informe o nome.").max(80),
  phone: z.string().trim().max(20),
  unit: z.string().trim().max(40),
  role: z.enum(["user", "porteiro", "admin", "sindico"]),
  active: z.boolean(),
});

export const updatePerson = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(residentPatch))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    forbid(canAssignRoles(profile.role), "Só o síndico altera níveis de acesso.");
    const targets = await sql<{
      registration_status: string;
    }>`select registration_status from profiles where user_id=${data.userId}`;
    if (targets[0]?.registration_status !== "aprovado")
      throw new Error("Aprove o cadastro do morador antes de alterar seu nível de acesso.");
    if (data.userId === profile.userId && !data.active) {
      throw new Error("Você não pode desativar a própria conta.");
    }
    if (data.role === "sindico") {
      await sql`
        update profiles set role = 'admin'
        where role = 'sindico' and user_id <> ${data.userId}
      `;
    }
    if (data.userId === profile.userId && data.role !== "sindico") {
      throw new Error("Transfira o síndico para outra pessoa antes de sair do cargo.");
    }
    await sql`
      update profiles
      set full_name = ${data.fullName},
          phone = ${data.phone},
          unit = ${data.unit},
          role = ${data.role},
          active = ${data.active}
      where user_id = ${data.userId}
    `;
    return { ok: true };
  });

const deliveryInput = z.object({
  residentUserId: z.string().min(1, "Escolha o morador."),
  carrier: z.string().trim().min(2, "Informe a transportadora.").max(40),
  trackingCode: z.string().trim().max(60),
  description: z.string().trim().min(2, "Descreva a encomenda.").max(240),
  photoData: z.string().optional(),
  origin: originSchema,
});

export const listDeliveries = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, profile } = await requireProfile(context.userId);
    const rows = await sql<{
      id: string;
      resident_user_id: string;
      unit: string;
      recipient_name: string;
      carrier: string;
      tracking_code: string;
      description: string;
      status: string;
      received_at: unknown;
      notified_at: unknown;
      signed_at: unknown;
      picked_up_at: unknown;
      has_photo: boolean;
      has_signature: boolean;
      phone: string;
    }>`
      select d.id, d.resident_user_id, d.unit, d.recipient_name, d.carrier, d.tracking_code,
             d.description, d.status, d.received_at, d.notified_at, d.signed_at, d.picked_up_at,
             (d.photo_data is not null) as has_photo,
             (d.signature_data is not null) as has_signature,
             p.phone
      from deliveries d
      join profiles p on p.user_id = d.resident_user_id
      where d.resident_user_id = ${profile.userId} or ${profile.role} <> 'user'
      order by d.received_at desc
      limit 80
    `;
    const residents = canRegisterDelivery(profile.role)
      ? (
          await sql<ProfileRow>`
            select user_id, full_name, email, phone, unit, role, active
            from profiles
            where active and role in ('user', 'admin', 'sindico') and unit <> ''
            order by unit, full_name
          `
        ).map(mapProfile)
      : [];
    return {
      me: profile,
      residents,
      deliveries: rows.map((row) => ({
        id: row.id,
        residentUserId: row.resident_user_id,
        unit: row.unit,
        recipientName: row.recipient_name,
        carrier: row.carrier,
        trackingCode: row.tracking_code,
        description: row.description,
        status: row.status,
        receivedAt: stamp(row.received_at) ?? "",
        notifiedAt: stamp(row.notified_at),
        signedAt: stamp(row.signed_at),
        pickedUpAt: stamp(row.picked_up_at),
        hasPhoto: Boolean(row.has_photo),
        hasSignature: Boolean(row.has_signature),
        phone: canRegisterDelivery(profile.role) ? row.phone : "",
        mine: row.resident_user_id === profile.userId,
      })),
    };
  });

export const createDelivery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(deliveryInput))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    forbid(canRegisterDelivery(profile.role), "Só a portaria registra encomendas.");
    if (data.photoData) assertImage(data.photoData, "Foto", 500_000);
    const residents = await sql<ProfileRow>`
      select user_id, full_name, email, phone, unit, role, active
      from profiles where user_id = ${data.residentUserId}
    `;
    const resident = residents[0] ? mapProfile(residents[0]) : null;
    if (!resident || !resident.active || !resident.unit) {
      throw new Error("Morador sem unidade ativa.");
    }
    if (resident.role === "porteiro") throw new Error("Escolha um morador.");
    const origin = safeOrigin(data.origin);
    const id = crypto.randomUUID();
    const signToken = token();
    const url = `${origin}/assinar/${signToken}`;
    const body = deliveryMessage({
      name: resident.fullName,
      unit: resident.unit,
      carrier: data.carrier,
      tracking: data.trackingCode,
      description: data.description,
      url,
    });
    await sql`
      insert into deliveries (
        id, resident_user_id, unit, recipient_name, carrier, tracking_code, description,
        photo_data, received_by, sign_token, whatsapp_body
      ) values (
        ${id}, ${resident.userId}, ${resident.unit}, ${resident.fullName}, ${data.carrier},
        ${data.trackingCode}, ${data.description}, ${data.photoData || null}, ${profile.userId},
        ${signToken}, ${body}
      )
    `;
    await sql`
      insert into notifications (id, user_id, kind, title, body, link_path)
      values (
        ${crypto.randomUUID()}, ${resident.userId}, 'entrega',
        ${"Encomenda na portaria"},
        ${`${data.carrier} · ${resident.unit}. Assine pelo celular.`},
        ${`/entregas/${id}`}
      )
    `;
    return {
      id,
      whatsappUrl: waLink(resident.phone, body),
      whatsappBody: body,
      phone: resident.phone,
      recipientName: resident.fullName,
    };
  });

export const prepareDeliveryWhatsapp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ id: z.string().min(1), origin: originSchema })))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    forbid(canRegisterDelivery(profile.role));
    const origin = safeOrigin(data.origin);
    const rows = await sql<{
      sign_token: string;
      recipient_name: string;
      unit: string;
      carrier: string;
      tracking_code: string;
      description: string;
      phone: string;
    }>`
      select d.sign_token, d.recipient_name, d.unit, d.carrier, d.tracking_code, d.description, p.phone
      from deliveries d
      join profiles p on p.user_id = d.resident_user_id
      where d.id = ${data.id}
    `;
    const row = rows[0];
    if (!row) throw new Error("Encomenda não encontrada.");
    const body = deliveryMessage({
      name: row.recipient_name,
      unit: row.unit,
      carrier: row.carrier,
      tracking: row.tracking_code,
      description: row.description,
      url: `${origin}/assinar/${row.sign_token}`,
    });
    await sql`
      update deliveries
      set whatsapp_body = ${body}, status = case when status = 'recebida' then 'notificada' else status end,
          notified_at = coalesce(notified_at, now())
      where id = ${data.id}
    `;
    return { whatsappUrl: waLink(row.phone, body), whatsappBody: body, phone: row.phone };
  });

export const getDelivery = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ id: z.string().min(1) })))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    const rows = await sql<{
      id: string;
      resident_user_id: string;
      unit: string;
      recipient_name: string;
      carrier: string;
      tracking_code: string;
      description: string;
      status: string;
      received_at: unknown;
      signed_at: unknown;
      signer_name: string;
      photo_data: string | null;
      signature_data: string | null;
      phone: string;
    }>`
      select d.id, d.resident_user_id, d.unit, d.recipient_name, d.carrier, d.tracking_code,
             d.description, d.status, d.received_at, d.signed_at, d.signer_name,
             d.photo_data, d.signature_data, p.phone
      from deliveries d
      join profiles p on p.user_id = d.resident_user_id
      where d.id = ${data.id}
    `;
    const row = rows[0];
    if (!row) throw new Error("Encomenda não encontrada.");
    const staff = canRegisterDelivery(profile.role);
    if (!staff && row.resident_user_id !== profile.userId) throw new Error("Sem permissão.");
    return {
      me: profile,
      delivery: {
        id: row.id,
        unit: row.unit,
        recipientName: row.recipient_name,
        carrier: row.carrier,
        trackingCode: row.tracking_code,
        description: row.description,
        status: row.status,
        receivedAt: stamp(row.received_at) ?? "",
        signedAt: stamp(row.signed_at),
        signerName: row.signer_name,
        photoData: row.photo_data,
        signatureData: row.signature_data,
        phone: staff ? row.phone : "",
        mine: row.resident_user_id === profile.userId,
      },
    };
  });

async function applySignature(sql: Sql, id: string, signatureData: string, signerName: string) {
  assertImage(signatureData, "Assinatura", 400_000);
  const rows = await sql<{ id: string }>`
    update deliveries
    set signature_data = ${signatureData},
        signer_name = ${signerName},
        signed_at = now(),
        status = case when status = 'retirada' then status else 'assinada' end
    where id = ${id} and signed_at is null
    returning id
  `;
  if (!rows[0]) throw new Error("Esta encomenda já foi assinada.");
}

export const signDelivery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    parse(
      z.object({
        id: z.string().min(1),
        signatureData: z.string().min(20),
        signerName: z.string().trim().min(2, "Informe o nome de quem assina.").max(80),
      }),
    ),
  )
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    const rows = await sql<{ resident_user_id: string }>`
      select resident_user_id from deliveries where id = ${data.id}
    `;
    if (!rows[0] || rows[0].resident_user_id !== profile.userId) {
      throw new Error("Só o morador desta unidade assina por aqui.");
    }
    await applySignature(sql, data.id, data.signatureData, data.signerName);
    return { ok: true };
  });

export const markPickedUp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ id: z.string().min(1) })))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    forbid(canRegisterDelivery(profile.role));
    const rows = await sql<{ id: string }>`
      update deliveries
      set status = 'retirada', picked_up_at = now()
      where id = ${data.id} and signed_at is not null and status <> 'retirada'
      returning id
    `;
    if (!rows[0]) throw new Error("A encomenda precisa estar assinada antes da retirada.");
    return { ok: true };
  });

export const cancelDelivery = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ id: z.string().min(1) })))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    forbid(canRegisterDelivery(profile.role));
    const rows = await sql<{ id: string }>`
      delete from deliveries
      where id = ${data.id} and status in ('recebida', 'notificada')
      returning id
    `;
    if (!rows[0]) throw new Error("Só dá para cancelar antes da assinatura.");
    return { ok: true };
  });

export const getDeliveryByToken = createServerFn({ method: "GET" })
  .validator(parse(z.object({ token: z.string().min(20) })))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      unit: string;
      recipient_name: string;
      carrier: string;
      tracking_code: string;
      description: string;
      status: string;
      received_at: unknown;
      signed_at: unknown;
      signer_name: string;
    }>`
      select id, unit, recipient_name, carrier, tracking_code, description, status,
             received_at, signed_at, signer_name
      from deliveries where sign_token = ${data.token}
    `;
    const row = rows[0];
    if (!row) throw new Error("Link de assinatura inválido ou expirado.");
    return {
      id: row.id,
      unit: row.unit,
      recipientName: row.recipient_name,
      carrier: row.carrier,
      trackingCode: row.tracking_code,
      description: row.description,
      status: row.status,
      receivedAt: stamp(row.received_at) ?? "",
      signedAt: stamp(row.signed_at),
      signerName: row.signer_name,
    };
  });

export const signDeliveryByToken = createServerFn({ method: "POST" })
  .validator(
    parse(
      z.object({
        token: z.string().min(20),
        signatureData: z.string().min(20),
        signerName: z.string().trim().min(2, "Informe o nome de quem assina.").max(80),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string }>`
      select id from deliveries where sign_token = ${data.token}
    `;
    if (!rows[0]) throw new Error("Link de assinatura inválido.");
    await applySignature(sql, rows[0].id, data.signatureData, data.signerName);
    return { ok: true };
  });

const pollInput = z.object({
  title: z.string().trim().min(4, "Dê um título para a enquete.").max(140),
  description: z.string().trim().max(800),
  options: z.array(z.string().trim().min(1).max(80)).min(2, "Inclua ao menos duas opções.").max(8),
  closesOn: z.string().trim(),
  origin: originSchema,
});

async function ensureBallots(sql: Sql, pollId: string) {
  const missing = await sql<{ user_id: string; unit: string; full_name: string; phone: string }>`
    select p.user_id, p.unit, p.full_name, p.phone
    from profiles p
    where p.active
      and p.role in ('user', 'admin', 'sindico')
      and p.unit <> ''
      and not exists (
        select 1 from poll_ballots b where b.poll_id = ${pollId} and b.user_id = p.user_id
      )
  `;
  for (const person of missing) {
    const ballotToken = token();
    await sql`
      insert into poll_ballots (id, poll_id, user_id, unit, token)
      values (${crypto.randomUUID()}, ${pollId}, ${person.user_id}, ${person.unit}, ${ballotToken})
    `;
    await sql`
      insert into notifications (id, user_id, kind, title, body, link_path)
      values (
        ${crypto.randomUUID()}, ${person.user_id}, 'enquete',
        ${"Nova enquete"},
        ${"Sua unidade pode votar agora."},
        ${`/enquetes/${pollId}`}
      )
    `;
  }
}

export const listPolls = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, profile } = await requireProfile(context.userId);
    const rows = await sql<{
      id: string;
      title: string;
      description: string;
      status: string;
      closes_at: unknown;
      created_at: unknown;
      votes: number;
      units: number;
    }>`
      select p.id, p.title, p.description, p.status, p.closes_at, p.created_at,
        (select count(*) from poll_ballots b where b.poll_id = p.id and b.voted_at is not null) as votes,
        (select count(distinct b.unit) from poll_ballots b where b.poll_id = p.id) as units
      from polls p
      order by p.created_at desc
      limit 40
    `;
    return {
      me: profile,
      polls: rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        closesAt: stamp(row.closes_at),
        createdAt: stamp(row.created_at) ?? "",
        votes: Number(row.votes ?? 0),
        units: Number(row.units ?? 0),
      })),
    };
  });

export const createPoll = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(pollInput))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    forbid(canManagePolls(profile.role), "Só admin ou síndico abre enquete.");
    const labels = [...new Set(data.options.map((item) => item.trim()).filter(Boolean))];
    if (labels.length < 2) throw new Error("Inclua ao menos duas opções diferentes.");
    const origin = safeOrigin(data.origin);
    const id = crypto.randomUUID();
    const closesAt = data.closesOn ? `${data.closesOn}T23:59:59-03:00` : null;
    await sql`
      insert into polls (id, title, description, created_by, closes_at)
      values (${id}, ${data.title}, ${data.description}, ${profile.userId}, ${closesAt})
    `;
    let position = 0;
    for (const label of labels) {
      await sql`
        insert into poll_options (id, poll_id, label, position)
        values (${crypto.randomUUID()}, ${id}, ${label}, ${position})
      `;
      position += 1;
    }
    await ensureBallots(sql, id);
    const ballots = await dispatchRows(sql, id, data.title, origin);
    return { id, ballots, share: pollShare({ id, title: data.title, origin }) };
  });

async function dispatchRows(sql: Sql, pollId: string, title: string, origin: string) {
  const rows = await sql<{
    full_name: string;
    phone: string;
    unit: string;
    token: string;
    voted_at: unknown;
  }>`
    select p.full_name, p.phone, b.unit, b.token, b.voted_at
    from poll_ballots b
    join profiles p on p.user_id = b.user_id
    where b.poll_id = ${pollId}
    order by b.unit, p.full_name
  `;
  return rows.map((row) => {
    const url = `${origin}/votar/${row.token}`;
    const body = pollMessage({ name: row.full_name, title, url });
    return {
      name: row.full_name || "Morador",
      unit: row.unit,
      phone: row.phone,
      voted: row.voted_at != null,
      whatsappUrl: waLink(row.phone, body),
      whatsappBody: body,
    };
  });
}

export const getPoll = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ id: z.string().min(1), origin: z.string() })))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    if (canManagePolls(profile.role)) await ensureBallots(sql, data.id);
    const polls = await sql<{
      id: string;
      title: string;
      description: string;
      status: string;
      closes_at: unknown;
    }>`
      select id, title, description, status, closes_at from polls where id = ${data.id}
    `;
    const poll = polls[0];
    if (!poll) throw new Error("Enquete não encontrada.");
    const options = await sql<{ id: string; label: string; votes: number }>`
      select o.id, o.label,
        (select count(*) from poll_ballots b where b.option_id = o.id and b.voted_at is not null) as votes
      from poll_options o
      where o.poll_id = ${poll.id}
      order by o.position
    `;
    const mine = await sql<{ option_id: string | null; voted_at: unknown; unit: string }>`
      select option_id, voted_at, unit from poll_ballots
      where poll_id = ${poll.id} and user_id = ${profile.userId}
    `;
    const unitVoted = mine[0]
      ? await sql<{ n: number }>`
          select count(*) as n from poll_ballots
          where poll_id = ${poll.id} and unit = ${mine[0].unit} and voted_at is not null
        `
      : [{ n: 0 }];
    const closed =
      poll.status !== "aberta" ||
      (poll.closes_at != null && new Date(String(stamp(poll.closes_at))) < new Date());
    const origin = data.origin ? safeOrigin(data.origin) : "";
    return {
      me: profile,
      poll: {
        id: poll.id,
        title: poll.title,
        description: poll.description,
        status: closed ? "encerrada" : poll.status,
        closesAt: stamp(poll.closes_at),
      },
      options: options.map((option) => ({
        id: option.id,
        label: option.label,
        votes: Number(option.votes ?? 0),
      })),
      myOptionId: mine[0]?.option_id ?? null,
      canVote:
        Boolean(mine[0]) && !mine[0].voted_at && Number(unitVoted[0]?.n ?? 0) === 0 && !closed,
      unitAlreadyVoted: Number(unitVoted[0]?.n ?? 0) > 0 && !mine[0]?.voted_at,
      share: canManagePolls(profile.role) && origin && !closed
        ? pollShare({ id: poll.id, title: poll.title, origin }) : null,
      ballots:
        canManagePolls(profile.role) && origin
          ? await dispatchRows(sql, poll.id, poll.title, origin)
          : [],
    };
  });

export const voteInApp = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ pollId: z.string().min(1), optionId: z.string().min(1) })))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    const ballots = await sql<{ id: string; token: string }>`
      select id, token from poll_ballots where poll_id = ${data.pollId} and user_id = ${profile.userId}
    `;
    if (!ballots[0]) throw new Error("Sua unidade não está nesta enquete. Confira o cadastro.");
    await castVote(sql, ballots[0].token, data.optionId);
    return { ok: true };
  });

export const closePoll = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ id: z.string().min(1) })))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    forbid(canManagePolls(profile.role));
    await sql`update polls set status = 'encerrada' where id = ${data.id}`;
    return { ok: true };
  });

async function castVote(sql: Sql, ballotToken: string, optionId: string) {
  const ballots = await sql<{
    id: string;
    poll_id: string;
    unit: string;
    voted_at: unknown;
    status: string;
    closes_at: unknown;
    active: boolean;
  }>`
    select b.id, b.poll_id, b.unit, b.voted_at, p.status, p.closes_at, pr.active
    from poll_ballots b
    join polls p on p.id = b.poll_id
    join profiles pr on pr.user_id = b.user_id
    where b.token = ${ballotToken}
  `;
  const ballot = ballots[0];
  if (!ballot) throw new Error("Link de voto inválido.");
  if (!ballot.active) throw new Error("Cadastro inativo.");
  if (ballot.voted_at) throw new Error("Este voto já foi registrado.");
  if (ballot.status !== "aberta") throw new Error("Enquete encerrada.");
  if (ballot.closes_at && new Date(String(stamp(ballot.closes_at))) < new Date()) {
    throw new Error("O prazo desta enquete acabou.");
  }
  const options = await sql<{ id: string }>`
    select id from poll_options where id = ${optionId} and poll_id = ${ballot.poll_id}
  `;
  if (!options[0]) throw new Error("Opção inválida.");
  const taken = await sql<{ n: number }>`
    select count(*) as n from poll_ballots
    where poll_id = ${ballot.poll_id} and unit = ${ballot.unit} and voted_at is not null
  `;
  if (Number(taken[0]?.n ?? 0) > 0) throw new Error("Esta unidade já votou.");
  try {
    const updated = await sql<{ id: string }>`
      update poll_ballots
      set option_id = ${optionId}, voted_at = now()
      where id = ${ballot.id} and voted_at is null
      returning id
    `;
    if (!updated[0]) throw new Error("Este voto já foi registrado.");
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") throw new Error("Esta unidade já votou.");
    throw error;
  }
}

export const getPollByToken = createServerFn({ method: "GET" })
  .validator(parse(z.object({ token: z.string().min(20) })))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const ballots = await sql<{
      poll_id: string;
      unit: string;
      voted_at: unknown;
      option_id: string | null;
      title: string;
      description: string;
      status: string;
      closes_at: unknown;
      full_name: string;
    }>`
      select b.poll_id, b.unit, b.voted_at, b.option_id, p.title, p.description, p.status, p.closes_at, pr.full_name
      from poll_ballots b
      join polls p on p.id = b.poll_id
      join profiles pr on pr.user_id = b.user_id
      where b.token = ${data.token}
    `;
    const ballot = ballots[0];
    if (!ballot) throw new Error("Link de voto inválido.");
    const options = await sql<{ id: string; label: string; votes: number }>`
      select o.id, o.label,
        (select count(*) from poll_ballots b where b.option_id = o.id and b.voted_at is not null) as votes
      from poll_options o where o.poll_id = ${ballot.poll_id} order by o.position
    `;
    const closed =
      ballot.status !== "aberta" ||
      (ballot.closes_at != null && new Date(String(stamp(ballot.closes_at))) < new Date());
    return {
      title: ballot.title,
      description: ballot.description,
      unit: ballot.unit,
      name: firstName(ballot.full_name),
      status: closed ? "encerrada" : "aberta",
      voted: ballot.voted_at != null,
      myOptionId: ballot.option_id,
      options: options.map((option) => ({
        id: option.id,
        label: option.label,
        votes: Number(option.votes ?? 0),
      })),
    };
  });

export const voteByToken = createServerFn({ method: "POST" })
  .validator(
    parse(
      z.object({ token: z.string().min(20), optionId: z.string().min(1, "Escolha uma opção.") }),
    ),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    await castVote(sql, data.token, data.optionId);
    return { ok: true };
  });

export const getFinance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, profile } = await requireProfile(context.userId);
    const month = brazilMonthRange("current");
    const previous = brazilMonthRange("previous");
    const settings = await sql<{ monthly_budget_cents: number; reserve_cents: number }>`
      select monthly_budget_cents, reserve_cents from finance_settings where id = 1
    `;
    const rows = await sql<{
      id: string;
      title: string;
      category: string;
      amount_cents: number;
      spent_on: string;
      vendor: string;
      notes: string;
      has_receipt: boolean;
      created_at: unknown;
    }>`
      select id, title, category, amount_cents, spent_on::text as spent_on, vendor, notes,
             (receipt_data is not null) as has_receipt, created_at
      from expenses
      order by spent_on desc, created_at desc
      limit 120
    `;
    const currentRows = rows.filter(
      (row) => row.spent_on >= month.start && row.spent_on < month.end,
    );
    const previousSpent = rows
      .filter((row) => row.spent_on >= previous.start && row.spent_on < previous.end)
      .reduce((sum, row) => sum + row.amount_cents, 0);
    const byCategory = new Map<string, number>();
    for (const row of currentRows) {
      byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.amount_cents);
    }
    const spent = currentRows.reduce((sum, row) => sum + row.amount_cents, 0);
    const budget = settings[0]?.monthly_budget_cents ?? 0;
    return {
      me: profile,
      budgetCents: budget,
      reserveCents: settings[0]?.reserve_cents ?? 0,
      spentCents: spent,
      previousSpentCents: previousSpent,
      remainingCents: budget - spent,
      categories: [...byCategory.entries()]
        .map(([category, cents]) => ({ category, cents }))
        .sort((a, b) => b.cents - a.cents),
      expenses: rows.map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        amountCents: row.amount_cents,
        spentOn: row.spent_on,
        vendor: row.vendor,
        notes: row.notes,
        hasReceipt: Boolean(row.has_receipt),
      })),
    };
  });

export const getReceipt = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ id: z.string().min(1) })))
  .handler(async ({ context, data }) => {
    const { sql } = await requireProfile(context.userId);
    const rows = await sql<{ receipt_data: string | null }>`
      select receipt_data from expenses where id = ${data.id}
    `;
    if (!rows[0]?.receipt_data) throw new Error("Sem comprovante.");
    return { receiptData: rows[0].receipt_data };
  });

const expenseInput = z.object({
  title: z.string().trim().min(2, "Informe o gasto.").max(120),
  category: z.string().trim().min(2).max(40),
  amountCents: z.number().int().positive("Informe um valor."),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  vendor: z.string().trim().max(80),
  notes: z.string().trim().max(400),
  receiptData: z.string().optional(),
});

export const createExpense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(expenseInput))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    forbid(canPostExpense(profile.role), "Só admin ou síndico lança gastos.");
    if (data.receiptData) assertImage(data.receiptData, "Comprovante", 700_000);
    await sql`
      insert into expenses (id, title, category, amount_cents, spent_on, vendor, notes, receipt_data, uploaded_by)
      values (
        ${crypto.randomUUID()}, ${data.title}, ${data.category}, ${data.amountCents}, ${data.spentOn},
        ${data.vendor}, ${data.notes}, ${data.receiptData || null}, ${profile.userId}
      )
    `;
    return { ok: true };
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ id: z.string().min(1) })))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    forbid(canPostExpense(profile.role));
    await sql`delete from expenses where id = ${data.id}`;
    return { ok: true };
  });

export const updateBudget = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    parse(
      z.object({
        monthlyBudgetCents: z.number().int().min(0),
        reserveCents: z.number().int().min(0),
      }),
    ),
  )
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    forbid(canPostExpense(profile.role), "Só admin ou síndico define o orçamento.");
    await sql`
      update finance_settings
      set monthly_budget_cents = ${data.monthlyBudgetCents},
          reserve_cents = ${data.reserveCents},
          updated_by = ${profile.userId},
          updated_at = now()
      where id = 1
    `;
    return { ok: true };
  });

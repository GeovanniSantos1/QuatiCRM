import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireProfile } from "./api";
import { ticketInput, areaInput, bookingInput, canManageOperations } from "./operations-rules";
import {
  insertTicket,
  changeTicket,
  addTicketMessage,
  insertBooking,
  changeBooking,
  saveCommonArea,
} from "./operations-queries.server";

const parse =
  <T>(schema: z.ZodType<T>) =>
  (input: unknown): T => {
    const result = schema.safeParse(input);
    if (!result.success) throw new Error(result.error.issues[0]?.message || "Dados inválidos.");
    return result.data;
  };
const idInput = z.object({ id: z.string().min(1).max(80) });
const stamp = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
type TicketRow = {
  id: string;
  resident_user_id: string;
  unit: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  version: number;
  created_at: unknown;
  updated_at: unknown;
  resident_name: string;
};
const mapTicket = (r: TicketRow, userId: string) => ({
  id: r.id,
  unit: r.unit,
  title: r.title,
  description: r.description,
  category: r.category,
  priority: r.priority,
  status: r.status,
  version: r.version,
  createdAt: stamp(r.created_at),
  updatedAt: stamp(r.updated_at),
  residentName: r.resident_name,
  mine: r.resident_user_id === userId,
});

export const listTickets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sql, profile } = await requireProfile(context.userId);
    const rows =
      await sql<TicketRow>`select t.*,p.full_name resident_name from condo_tickets t join profiles p on p.user_id=t.resident_user_id
    where t.resident_user_id=${context.userId} or ${canManageOperations(profile.role)}
    order by (t.status in ('aberto','em_andamento')) desc,(t.priority='alta') desc,t.updated_at desc limit 200`;
    return {
      tickets: rows.map((r) => mapTicket(r, context.userId)),
      manager: canManageOperations(profile.role),
    };
  });
export const getTicket = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(parse(idInput))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    const [ticket] =
      await sql<TicketRow>`select t.*,p.full_name resident_name from condo_tickets t join profiles p on p.user_id=t.resident_user_id
    where t.id=${data.id} and (t.resident_user_id=${context.userId} or ${canManageOperations(profile.role)})`;
    if (!ticket) throw new Error("Chamado não encontrado ou sem permissão.");
    const messages = await sql<{
      id: string;
      body: string;
      full_name: string;
      author_id: string;
      created_at: unknown;
    }>`select m.*,p.full_name from ticket_messages m join profiles p on p.user_id=m.author_id
    where m.ticket_id=${data.id} order by m.created_at desc,m.id desc limit 200`;
    const events = await sql<{
      id: string;
      status: string;
      note: string;
      full_name: string;
      created_at: unknown;
    }>`select e.*,p.full_name from ticket_events e join profiles p on p.user_id=e.author_id
    where e.ticket_id=${data.id} order by e.created_at desc,e.id desc limit 100`;
    return {
      ticket: mapTicket(ticket, context.userId),
      messages: messages.reverse().map((m) => ({
        id: m.id,
        body: m.body,
        author: m.full_name,
        mine: m.author_id === context.userId,
        at: stamp(m.created_at),
      })),
      events: events.reverse().map((e) => ({
        id: e.id,
        status: e.status,
        note: e.note,
        author: e.full_name,
        at: stamp(e.created_at),
      })),
    };
  });
export const createTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(ticketInput))
  .handler(async ({ context, data }) => {
    const { sql } = await requireProfile(context.userId);
    const [row] = await insertTicket(sql, context.userId, data);
    if (!row) throw new Error("Seu acesso foi alterado. Atualize a página.");
    return row;
  });
export const sendTicketMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(idInput.extend({ body: z.string().trim().min(1).max(2000) })))
  .handler(async ({ context, data }) => {
    const { sql } = await requireProfile(context.userId);
    if (!(await addTicketMessage(sql, context.userId, data.id, data.body))[0])
      throw new Error("O chamado foi encerrado ou você não tem permissão para responder.");
    return { ok: true };
  });
export const updateTicket = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    parse(
      idInput.extend({
        version: z.number().int().min(0),
        status: z.enum(["aberto", "em_andamento", "resolvido", "cancelado"]),
        note: z
          .string()
          .trim()
          .min(3, "Informe o motivo ou a solução com pelo menos 3 caracteres.")
          .max(1000),
      }),
    ),
  )
  .handler(async ({ context, data }) => {
    const { sql } = await requireProfile(context.userId);
    if (!(await changeTicket(sql, context.userId, data))[0])
      throw new Error("Chamado alterado por outra pessoa ou ação não permitida. Atualize a lista.");
    return { ok: true };
  });

type AreaRow = {
  id: string;
  name: string;
  description: string;
  capacity: number;
  opens: number;
  closes: number;
  active: boolean;
};
type BookingRow = {
  id: string;
  area_id: string;
  area_name: string;
  resident_user_id: string;
  resident_name: string;
  unit: string;
  booked_on: unknown;
  start_minutes: number;
  end_minutes: number;
  purpose: string;
  guests: number;
  status: string;
  reason: string;
  version: number;
  created_at: unknown;
};
export const listReservations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })))
  .handler(async ({ context, data }) => {
    const { sql, profile } = await requireProfile(context.userId);
    const manager = canManageOperations(profile.role);
    const areas =
      await sql<AreaRow>`select * from common_areas where active or ${manager} order by name`;
    const rows =
      await sql<BookingRow>`select r.*,a.name area_name,p.full_name resident_name from reservations r
    join common_areas a on a.id=r.area_id join profiles p on p.user_id=r.resident_user_id
    where (${manager} or r.resident_user_id=${context.userId} or (${profile.role}='porteiro' and r.status='aprovado' and r.booked_on=${data.date}::date))
    order by (r.status='pendente') desc,r.booked_on desc,r.start_minutes limit 200`;
    const agenda = await sql<{
      area_id: string;
      start_minutes: number;
      end_minutes: number;
      status: string;
    }>`select area_id,start_minutes,end_minutes,status from reservations
    where booked_on=${data.date}::date and status in ('pendente','aprovado') order by start_minutes`;
    return {
      manager,
      guard: profile.role === "porteiro",
      areas,
      agenda: agenda.map((r) => ({
        areaId: r.area_id,
        start: r.start_minutes,
        end: r.end_minutes,
        status: r.status,
      })),
      reservations: rows.map((r) => ({
        id: r.id,
        areaId: r.area_id,
        areaName: r.area_name,
        residentName: r.resident_name,
        unit: r.unit,
        date:
          r.booked_on instanceof Date
            ? r.booked_on.toISOString().slice(0, 10)
            : String(r.booked_on),
        start: r.start_minutes,
        end: r.end_minutes,
        purpose: r.purpose,
        guests: r.guests,
        status: r.status,
        reason: r.reason,
        version: r.version,
        mine: r.resident_user_id === context.userId,
      })),
    };
  });
export const saveArea = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(areaInput))
  .handler(async ({ context, data }) => {
    const { sql } = await requireProfile(context.userId);
    try {
      if (!(await saveCommonArea(sql, context.userId, data))[0])
        throw new Error("Somente admin e síndico podem configurar áreas.");
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new Error("Já existe uma área com esse nome.");
      throw error;
    }
    return { ok: true };
  });
export const requestReservation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parse(bookingInput))
  .handler(async ({ context, data }) => {
    const { sql } = await requireProfile(context.userId);
    try {
      const [row] = await insertBooking(sql, context.userId, data);
      if (!row)
        throw new Error(
          "Confira a unidade do seu cadastro, a capacidade e o horário da área. Escolha um período futuro, em até 90 dias.",
        );
      return row;
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new Error(
          "Esse horário acabou de ser ocupado. Atualize a agenda e escolha outro período.",
        );
      if ((error as { code?: string }).code === "22008")
        throw new Error("Informe uma data válida.");
      throw error;
    }
  });
export const reviewReservation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    parse(
      idInput
        .extend({
          version: z.number().int().min(0),
          status: z.enum(["aprovado", "recusado", "cancelado"]),
          reason: z.string().trim().max(1000),
        })
        .refine((v) => v.status === "aprovado" || v.reason.length >= 3, {
          message: "Informe um motivo com pelo menos 3 caracteres.",
        }),
    ),
  )
  .handler(async ({ context, data }) => {
    const { sql } = await requireProfile(context.userId);
    if (!(await changeBooking(sql, context.userId, data))[0])
      throw new Error("Reserva alterada, já iniciada ou ação não permitida. Atualize a agenda.");
    return { ok: true };
  });

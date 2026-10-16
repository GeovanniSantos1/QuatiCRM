import { z } from "zod";
export const TICKET_STATUS = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
  cancelado: "Cancelado",
} as const;
export const TICKET_CATEGORIES = {
  manutencao: "Manutenção",
  limpeza: "Limpeza",
  seguranca: "Segurança",
  convivencia: "Convivência",
  outro: "Outro",
} as const;
export const PRIORITIES = { baixa: "Baixa", normal: "Normal", alta: "Alta" } as const;
export const BOOKING_STATUS = {
  pendente: "Aguardando aprovação",
  aprovado: "Aprovada",
  recusado: "Recusada",
  cancelado: "Cancelada",
} as const;
export const canManageOperations = (role: string) => role === "admin" || role === "sindico";
export const ticketInput = z.object({
  title: z.string().trim().min(5, "Descreva o assunto com pelo menos 5 caracteres.").max(120),
  description: z
    .string()
    .trim()
    .min(10, "Descreva o problema com pelo menos 10 caracteres.")
    .max(3000),
  category: z.enum(["manutencao", "limpeza", "seguranca", "convivencia", "outro"]),
  priority: z.enum(["baixa", "normal", "alta"]),
});
export const areaInput = z
  .object({
    id: z.string().max(80),
    name: z.string().trim().min(3, "Informe o nome da área.").max(80),
    description: z.string().trim().max(500),
    capacity: z.number().int().min(1).max(500),
    opens: z.number().int().min(0).max(1425).multipleOf(15),
    closes: z.number().int().min(15).max(1440).multipleOf(15),
    active: z.boolean(),
  })
  .refine((v) => v.closes > v.opens, { message: "O fechamento deve ser depois da abertura." });
export const bookingInput = z
  .object({
    areaId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
    start: z.number().int().min(0).max(1425).multipleOf(15),
    end: z.number().int().min(15).max(1440).multipleOf(15),
    purpose: z.string().trim().min(3, "Informe a finalidade da reserva.").max(160),
    guests: z.number().int().min(1).max(500),
  })
  .refine((v) => v.end > v.start && v.end - v.start <= 720, {
    message: "Escolha um período de até 12 horas, com término após o início.",
  });
export const minuteLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const parseMinute = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
export function saoPauloDate(offset = 0) {
  const date = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(date);
}

import { z } from "zod";
import type { Role } from "./roles";

export type RegistrationStatus = "pendente" | "aprovado" | "recusado";
export function canManageResidents(role: Role) {
  return role === "admin" || role === "sindico";
}
export const residentDetails = z.object({
  fullName: z.string().trim().min(2, "Informe o nome completo.").max(80),
  unit: z.string().trim().min(1, "Informe a unidade.").max(40),
  phone: z
    .string()
    .transform((value) => value.replace(/[\s()+-]/g, ""))
    .pipe(z.string().regex(/^\d{10,15}$/, "Informe um telefone com DDD válido.")),
});
export const invitationDetails = residentDetails.extend({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido.").max(200),
});
export const invitationToken = z.string().regex(/^[a-f0-9]{64}$/, "Convite inválido.");

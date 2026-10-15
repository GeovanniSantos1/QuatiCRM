import { z } from "zod";
import type { Role } from "./roles";

export function normalizePlate(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

export function normalizeUnit(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export const plateInput = z
  .string()
  .max(20)
  .transform(normalizePlate)
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/,
        "Informe uma placa válida, como ABC-1234 ou ABC1D23.",
      ),
  );

export const vehicleInput = z.object({
  plate: plateInput,
  model: z.string().trim().min(2, "Informe a marca e o modelo.").max(80),
  color: z.string().trim().min(2, "Informe a cor.").max(30),
});

export function canReviewVehicles(role: Role) {
  return role === "admin" || role === "sindico";
}

export function canConsultVehicles(role: Role) {
  return role === "porteiro" || canReviewVehicles(role);
}

export type VehicleStatus = "pendente" | "aprovado" | "recusado" | "cancelado";
export const VEHICLE_STATUS: Record<VehicleStatus, string> = {
  pendente: "Aguardando aprovação",
  aprovado: "Aprovado",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

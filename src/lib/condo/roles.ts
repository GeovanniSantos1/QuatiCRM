export const ROLES = ["user", "porteiro", "admin", "sindico"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  user: "User",
  porteiro: "Porteiro",
  admin: "Admin",
  sindico: "Síndico",
};

export const ROLE_HINT: Record<Role, string> = {
  user: "Morador",
  porteiro: "Portaria",
  admin: "Administração",
  sindico: "Gestão geral",
};

export function asRole(value: string): Role {
  if (value === "porteiro" || value === "admin" || value === "sindico" || value === "user") {
    return value;
  }
  return "user";
}

export function canRegisterDelivery(role: Role) {
  return role === "porteiro" || role === "admin" || role === "sindico";
}

export function canManagePolls(role: Role) {
  return role === "admin" || role === "sindico";
}

export function canPostExpense(role: Role) {
  return role === "admin" || role === "sindico";
}

export function canAssignRoles(role: Role) {
  return role === "sindico";
}

export const EXPENSE_CATEGORIES = [
  "Pessoal",
  "Limpeza",
  "Manutenção",
  "Energia",
  "Água",
  "Segurança",
  "Administração",
  "Obras",
  "Outros",
] as const;

export const CARRIERS = [
  "Correios",
  "Mercado Livre",
  "Amazon",
  "Shopee",
  "Magalu",
  "iFood",
  "Rappi",
  "Transportadora",
  "Outra",
] as const;

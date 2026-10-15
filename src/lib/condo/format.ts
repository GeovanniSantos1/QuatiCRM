export function formatBrl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function parseBrlToCents(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "").replace(/R\$/i, "");
  if (!trimmed) return null;
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function formatWhen(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

export function formatDay(iso: string) {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00-03:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function firstName(full: string) {
  const bit = full.trim().split(/\s+/)[0];
  return bit || "morador";
}

export function greeting(name: string) {
  const hour = new Date(Date.now() - 3 * 60 * 60 * 1000).getUTCHours();
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  return `${hello}, ${firstName(name)}`;
}

export function waLink(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export function deliveryMessage(input: {
  name: string;
  unit: string;
  carrier: string;
  tracking: string;
  description: string;
  url: string;
}) {
  const extra = [input.carrier, input.tracking].filter(Boolean).join(" · ");
  return [
    `Olá, ${firstName(input.name)}! A portaria do Condomínio Quati registrou uma encomenda para a unidade ${input.unit}.`,
    extra,
    input.description,
    "",
    "Assine pelo celular (não precisa instalar nada):",
    input.url,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function pollMessage(input: { name: string; title: string; url: string }) {
  return [
    `Olá, ${firstName(input.name)}! O Condomínio Quati abriu uma enquete:`,
    "",
    input.title,
    "",
    "Vote pelo celular. Cada unidade vota uma vez:",
    input.url,
  ].join("\n");
}

export function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Algo deu errado. Tente de novo.";
}

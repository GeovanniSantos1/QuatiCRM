import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
export const opsCard = "rounded-2xl border border-line bg-card p-5 sm:p-6";
export const opsLabel = "block text-sm font-semibold";
export function StatusTag({ children, quiet = false }: { children: ReactNode; quiet?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${quiet ? "bg-paper text-muted" : "bg-moss text-pine"}`}
    >
      {children}
    </span>
  );
}
export function OpsEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-5 py-10 text-center">
      <Inbox className="mx-auto mb-3 size-7 text-muted" aria-hidden="true" />
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}
export function OpsStats({ items }: { items: { label: string; value: number }[] }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-line bg-card p-4">
          <p className="text-2xl font-bold tabular-nums">{item.value}</p>
          <p className="mt-1 text-xs text-muted">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
export const opsDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
export const dayLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T12:00:00Z`),
  );

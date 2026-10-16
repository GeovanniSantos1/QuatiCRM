import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Notice, btnClay, useQuati } from "@/components/app-shell";
import { claimSindico } from "@/lib/condo/api";
import { errorText, formatBrl } from "@/lib/condo/format";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CheckCheck,
  CarFront,
  ClipboardList,
  CalendarDays,
  Package,
  PieChart,
  Users,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { greeting } from "@/lib/condo/format";

export const Route = createFileRoute("/painel")({ component: Page });

function Page() {
  return (
    <AppShell>
      <Painel />
    </AppShell>
  );
}

const healthLabel = {
  saudavel: "Saudável",
  atencao: "Atenção",
  acima: "Acima do orçamento",
  "sem-orcamento": "Defina o orçamento",
} as const;

function Painel() {
  const { data, loading, error, refresh } = useQuati();
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  if (loading && !data) return <div className="h-40 animate-pulse rounded-3xl bg-line" />;
  if (error && !data) return <Notice tone="bad">{error}</Notice>;
  if (!data) return null;

  const { profile, stats } = data;
  const incomplete = !profile.unit || !profile.phone;

  async function claim() {
    setClaiming(true);
    setClaimError(null);
    try {
      await claimSindico();
      refresh();
    } catch (err) {
      setClaimError(errorText(err));
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-widest text-pine uppercase">
            Seu condomínio em um só lugar
          </p>
          <h1 className="font-display text-4xl">{greeting(profile.fullName || "morador")}.</h1>
          <p className="mt-2 text-sm text-muted">Acompanhe o que acontece e organize o seu dia.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-xs font-medium text-muted">
          <Building2 className="size-4 text-pine" aria-hidden="true" />
          {profile.unit ? `Unidade ${profile.unit}` : "Condomínio Quati"}
        </span>
      </div>

      {!data.sindicoName && (
        <section className="rounded-3xl bg-pine p-5 text-paper">
          <h2 className="font-display text-3xl">O condomínio ainda não tem síndico.</h2>
          <p className="mt-2 max-w-lg text-sm text-paper/80">
            Quem assume define os níveis User, Porteiro, Admin e Síndico. Complete nome e unidade
            antes.
          </p>
          {claimError && <p className="mt-3 text-sm text-clay">{claimError}</p>}
          <button
            type="button"
            className={`${btnClay} mt-4`}
            disabled={claiming}
            onClick={() => void claim()}
          >
            {claiming ? "Assumindo…" : "Assumir como síndico"}
          </button>
        </section>
      )}

      {incomplete && (
        <Notice>
          Falta telefone ou unidade no cadastro. Sem isso a portaria não consegue avisar no
          WhatsApp.{" "}
          <Link to="/moradores" className="font-semibold underline">
            Completar cadastro
          </Link>
        </Notice>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat
          icon={Package}
          label="Encomendas em aberto"
          value={String(stats.openDeliveries)}
          hint="Acompanhar entregas"
          href="/entregas"
        />
        <Stat
          icon={Vote}
          label="Enquetes abertas"
          value={String(stats.openPolls)}
          hint="Participar das decisões"
          href="/enquetes"
        />
        <Stat
          icon={PieChart}
          label="Caixa do mês"
          value={formatBrl(stats.monthSpentCents)}
          hint={healthLabel[stats.health]}
          href="/financeiro"
        />
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <section
          id="avisos"
          className="scroll-mt-24 overflow-hidden rounded-3xl border border-line bg-card xl:col-span-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-2xl">Central de avisos</h2>
              <p className="mt-0.5 text-xs text-muted">Entregas, enquetes, chamados e reservas</p>
            </div>
            <span className="rounded-md bg-paper px-2.5 py-1 text-xs font-semibold text-muted">
              {data.notifications.length} aviso{data.notifications.length === 1 ? "" : "s"}
            </span>
          </div>
          {data.notifications.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
              <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-moss text-pine">
                <CheckCheck className="size-6" aria-hidden="true" />
              </span>
              <h3 className="font-semibold">Tudo em dia por aqui</h3>
              <p className="mt-2 max-w-xs text-sm text-muted">
                Quando houver novidades do condomínio, seus avisos aparecerão aqui.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.notifications.map((note) => (
                <li key={note.id}>
                  <a
                    href={note.linkPath || "/painel"}
                    className="flex items-start gap-3 px-5 py-4 hover:bg-paper"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-moss text-pine">
                      <Bell className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-semibold">{note.title}</span>
                      <span className="mt-1 block text-sm text-muted">{note.body}</span>
                    </span>
                    {!note.read && (
                      <span
                        className="mt-2 size-2 shrink-0 rounded-full bg-pine"
                        aria-label="Não lido"
                      />
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="overflow-hidden rounded-3xl border border-line bg-card">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-display text-2xl">Acesso rápido</h2>
            <p className="mt-0.5 text-xs text-muted">O que você precisa, a um clique</p>
          </div>
          <div className="space-y-1 p-3">
            <QuickLink
              icon={Package}
              title="Entregas"
              description="Recebimentos e assinaturas"
              href="/entregas"
            />
            <QuickLink
              icon={CarFront}
              title="Veículos"
              description="Cadastros e autorização de entrada"
              href="/veiculos"
            />
            <QuickLink
              icon={ClipboardList}
              title="Chamados"
              description="Problemas, respostas e manutenção"
              href="/chamados"
            />
            <QuickLink
              icon={CalendarDays}
              title="Reservas"
              description="Agenda de áreas comuns"
              href="/reservas"
            />
            <QuickLink
              icon={Vote}
              title="Enquetes"
              description="Decisões do condomínio"
              href="/enquetes"
            />
            <QuickLink
              icon={PieChart}
              title="Financeiro"
              description="Gastos e comprovantes"
              href="/financeiro"
            />
            <QuickLink
              icon={Users}
              title="Pessoas"
              description="Moradores e contatos"
              href="/moradores"
            />
          </div>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
        <span>Condomínio Quati · Visão geral</span>
        <span>Dados conforme o seu nível de acesso</span>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  href: string;
}) {
  return (
    <Link to={href} className="group rounded-3xl border border-line bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="grid size-10 place-items-center rounded-xl bg-moss text-pine">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <ArrowUpRight className="size-4 text-muted group-hover:text-pine" aria-hidden="true" />
      </div>
      <p className="mt-4 text-sm font-medium text-muted">{label}</p>
      <p className="stat-value mt-1 font-bold tabular-nums">{value}</p>
      {hint && (
        <p className="mt-4 border-t border-line pt-3 text-xs font-medium text-pine">{hint}</p>
      )}
    </Link>
  );
}

function QuickLink({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="flex min-h-16 items-center gap-3 rounded-lg px-2 py-3 hover:bg-paper"
    >
      <Icon className="size-4 shrink-0 text-pine" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
    </Link>
  );
}

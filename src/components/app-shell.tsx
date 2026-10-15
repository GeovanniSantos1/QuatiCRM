import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Bell,
  Building2,
  CarFront,
  ChevronRight,
  LayoutDashboard,
  Package,
  PieChart,
  Users,
  Vote,
} from "lucide-react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { bootstrap } from "@/lib/condo/api";
import { errorText } from "@/lib/condo/format";
import { ROLE_HINT, ROLE_LABEL } from "@/lib/condo/roles";
import { QuatiMark } from "@/components/quati-mark";
import { getMembershipAccess } from "@/lib/condo/memberships";
import { ResidentRegistrationGate } from "@/components/resident-registration-gate";

export type QuatiData = Awaited<ReturnType<typeof bootstrap>>;

type Ctx = {
  data: QuatiData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const QuatiCtx = createContext<Ctx | null>(null);

export function useQuati() {
  const value = useContext(QuatiCtx);
  if (!value) throw new Error("Fora do painel");
  return value;
}

const links = [
  { to: "/painel", label: "Visão geral", icon: LayoutDashboard },
  { to: "/entregas", label: "Entregas", icon: Package },
  { to: "/veiculos", label: "Veículos", icon: CarFront },
  { to: "/enquetes", label: "Enquetes", icon: Vote },
  { to: "/financeiro", label: "Financeiro", icon: PieChart },
  { to: "/moradores", label: "Pessoas", icon: Users },
] as const;

export const btn =
  "crm-button inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50";
export const btnClay = `${btn} bg-clay text-paper`;
export const btnPine = `${btn} bg-pine text-paper`;
export const btnGhost = `${btn} border border-line bg-card text-ink`;
export const field = "w-full min-h-11 rounded-xl border border-line bg-card px-3 text-sm text-ink";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [data, setData] = useState<QuatiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [access, setAccess] = useState<Awaited<ReturnType<typeof getMembershipAccess>> | null>(
    null,
  );
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancel = false;
    setLoading(true);
    getMembershipAccess()
      .then((next) => {
        if (cancel) return null;
        setAccess(next);
        if (next.status !== "aprovado" || !next.profile.active) {
          setData(null);
          setError(null);
          return null;
        }
        return bootstrap();
      })
      .then((next) => {
        if (!cancel && next) {
          setData(next);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancel) setError(errorText(err));
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [userId, tick]);

  if (isPending) return <FullSkeleton />;
  if (!user) return <RedirectToSignIn />;
  if (access && access.profile.userId !== user.id) return <FullSkeleton />;
  if (!access && loading) return <FullSkeleton />;
  if (!access)
    return (
      <div className="min-h-screen bg-paper p-6">
        <Notice tone="bad">{error || "Não foi possível verificar seu cadastro."}</Notice>
        <button type="button" className={`${btnGhost} mt-4`} onClick={() => setTick((n) => n + 1)}>
          Tentar novamente
        </button>
      </div>
    );
  if (access.status !== "aprovado" || !access.profile.active)
    return (
      <ResidentRegistrationGate
        key={`${access.profile.userId}:${access.status}:${access.version}`}
        access={access}
        onRefresh={() => setTick((n) => n + 1)}
      />
    );

  const unread = data?.notifications.filter((note) => !note.read).length ?? 0;
  const current = links.find((link) => pathname === link.to || pathname.startsWith(`${link.to}/`));

  return (
    <QuatiCtx.Provider value={{ data, loading, error, refresh: () => setTick((n) => n + 1) }}>
      <div className="min-h-screen bg-paper text-ink">
        <a
          href="#conteudo"
          className="sr-only z-50 rounded-lg bg-pine p-3 text-card focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Pular para o conteúdo
        </a>
        <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-card px-5 py-7 md:flex">
          <Brand />
          <div className="mt-8 flex items-center gap-3 rounded-xl border border-line bg-paper p-3">
            <Building2
              className="size-9 shrink-0 rounded-lg bg-card p-2 text-pine"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold">Condomínio Quati</p>
              <p className="text-xs text-muted">Seu espaço de gestão</p>
            </div>
          </div>
          <p className="mt-7 px-3 text-xs font-semibold tracking-widest text-muted uppercase">
            Principal
          </p>
          <nav aria-label="Navegação principal" className="mt-3 flex flex-1 flex-col gap-1.5">
            {links.map((link) => {
              const active = pathname === link.to || pathname.startsWith(`${link.to}/`);
              const Icon = link.icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  className={`crm-nav-link flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-semibold ${active ? "bg-moss text-pine" : "text-muted"}`}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {link.label}
                  {active && <span className="ml-auto size-1.5 rounded-full bg-pine" />}
                </Link>
              );
            })}
          </nav>
          <div className="rounded-xl bg-pine-deep p-4 text-card">
            <Building2 className="mb-3 size-5 text-card/80" aria-hidden="true" />
            <p className="text-sm font-semibold">Tudo começa com pessoas.</p>
            <p className="mt-1 text-xs leading-relaxed text-card/75">
              Mantenha os contatos do condomínio sempre atualizados.
            </p>
            <Link
              to="/moradores"
              className="mt-3 flex min-h-11 items-center justify-between text-xs font-semibold text-card"
            >
              Ver pessoas <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-5 px-1 text-xs text-muted">Quati · Gestão condominial</p>
        </aside>

        <div className="md:pl-64">
          <header className="sticky top-0 z-10 flex min-h-20 items-center justify-between gap-3 border-b border-line bg-card px-4 py-3 md:px-8">
            <div className="min-w-0 md:hidden">
              <Brand compact />
            </div>
            <div className="hidden min-w-0 md:block">
              <p className="flex items-center gap-2 text-sm text-muted">
                <Building2 className="size-4" aria-hidden="true" /> Workspace{" "}
                <ChevronRight className="size-3" aria-hidden="true" />
                <span className="font-semibold text-ink">{current?.label || "Painel"}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              {data && (
                <span
                  title={ROLE_HINT[data.profile.role]}
                  className="hidden rounded-md bg-moss px-2.5 py-1 text-xs font-semibold text-pine lg:inline"
                >
                  {ROLE_LABEL[data.profile.role]}
                </span>
              )}
              <Link
                to="/painel"
                hash="avisos"
                className="relative grid size-11 shrink-0 place-items-center rounded-lg border border-line text-muted hover:bg-moss"
                aria-label={unread ? `Ver ${unread} avisos não lidos` : "Ver avisos"}
              >
                <Bell className="size-4" aria-hidden="true" />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-clay text-xs font-bold text-card">
                    {unread}
                  </span>
                )}
              </Link>
              <div className="max-w-40 border-l border-line pl-3 [&>div]:flex-wrap [&_span]:max-w-28 [&_span]:truncate">
                <UserButton />
              </div>
            </div>
          </header>
          <main
            id="conteudo"
            className="crm-content mx-auto w-full max-w-7xl px-4 pt-7 pb-28 md:px-8 md:pt-8 md:pb-12"
          >
            {children}
          </main>
        </div>

        <nav
          aria-label="Navegação no celular"
          className="crm-bottom-nav fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-line bg-card md:hidden"
        >
          {links.map((link) => {
            const active = pathname === link.to || pathname.startsWith(`${link.to}/`);
            const Icon = link.icon;
            return (
              <Link
                key={link.to}
                to={link.to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? "text-pine" : "text-muted"}`}
              >
                <Icon className="size-5" aria-hidden="true" />
                {link.to === "/painel"
                  ? "Início"
                  : link.to === "/financeiro"
                    ? "Caixa"
                    : link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </QuatiCtx.Provider>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/painel" className="flex items-center gap-3">
      <QuatiMark />
      {!compact && (
        <span>
          <span className="block font-display text-2xl leading-none text-ink">
            quati<span className="text-pine">.</span>
          </span>
          <span className="text-xs text-muted">Gestão condominial</span>
        </span>
      )}
      {compact && <span className="font-display text-xl text-ink">Quati</span>}
    </Link>
  );
}

function FullSkeleton() {
  return (
    <div className="min-h-screen bg-paper px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="h-10 w-40 animate-pulse rounded-xl bg-line" />
        <div className="h-32 animate-pulse rounded-3xl bg-line" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="h-24 animate-pulse rounded-3xl bg-line" />
          <div className="h-24 animate-pulse rounded-3xl bg-line" />
          <div className="h-24 animate-pulse rounded-3xl bg-line" />
        </div>
      </div>
    </div>
  );
}

export function Notice({ children, tone = "ok" }: { children: ReactNode; tone?: "ok" | "bad" }) {
  return (
    <p
      role={tone === "bad" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm ${tone === "bad" ? "border-danger/20 bg-danger-soft text-danger" : "border-pine/15 bg-moss text-pine"}`}
    >
      {children}
    </p>
  );
}

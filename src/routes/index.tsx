import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, CheckCircle2, Package, PieChart, Vote } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { QuatiMark } from "@/components/quati-mark";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-line px-5 py-5">
        <span className="flex items-center gap-3">
          <QuatiMark />
          <span className="font-display text-2xl">
            quati<span className="text-pine">.</span>
          </span>
        </span>
        {isPending ? (
          <span className="h-11 w-28 animate-pulse rounded-full bg-line" />
        ) : user ? (
          <Link
            to="/painel"
            className="inline-flex min-h-11 items-center rounded-full bg-pine px-4 text-sm font-semibold text-paper"
          >
            Abrir painel
          </Link>
        ) : (
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center rounded-full bg-pine px-4 text-sm font-semibold text-paper"
          >
            Entrar
          </Link>
        )}
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-12 md:grid-cols-2 md:py-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-pine">
            <Building2 className="size-3.5" aria-hidden="true" /> Gestão condominial, mais próxima
          </p>
          <h1 className="mt-6 font-display text-4xl leading-tight text-ink md:text-5xl">
            Seu condomínio.
            <br />
            <span className="text-pine">Tudo conectado.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted">
            Simplifique a rotina de quem cuida e de quem mora. Entregas, decisões e finanças em um
            único lugar.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {isPending ? (
              <span className="h-11 w-40 animate-pulse rounded-full bg-line" />
            ) : (
              <Link
                to={user ? "/painel" : "/login"}
                className="crm-button inline-flex min-h-12 items-center gap-3 rounded-lg bg-clay px-5 text-sm font-semibold text-card"
              >
                {user ? "Continuar" : "Entrar no condomínio"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </div>
          {!isPending && !user && (
            <Link
              to="/login"
              search={{ cadastro: true }}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-pine hover:underline"
            >
              Sou morador e quero me cadastrar
            </Link>
          )}
        </div>
        <article className="overflow-hidden rounded-3xl border border-line bg-card shadow-card">
          <div className="flex items-center justify-between border-b border-line p-5">
            <span className="font-display text-lg">Uma rotina mais simples</span>
            <span className="rounded-md bg-moss px-2 py-1 text-xs font-medium text-pine">
              Com Quati
            </span>
          </div>
          <div className="p-6">
            <span className="grid size-12 place-items-center rounded-xl bg-moss text-pine">
              <Package className="size-6" aria-hidden="true" />
            </span>
            <h2 className="mt-4 font-display text-2xl">Da portaria ao seu celular.</h2>
            <p className="mt-2 text-sm text-muted">
              Acompanhe cada etapa da entrega, sem perder nenhuma informação.
            </p>
            <ol className="mt-6 space-y-4">
              {[
                "A portaria registra a encomenda",
                "O aviso chega pelo WhatsApp",
                "O morador assina no celular",
              ].map((step, i) => (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-paper text-xs font-semibold text-pine">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
          <p className="flex items-center gap-2 border-t border-line bg-moss px-6 py-4 text-xs font-medium text-pine">
            <CheckCircle2 className="size-4" aria-hidden="true" /> Tudo registrado. Tudo em um só
            lugar.
          </p>
        </article>
      </section>

      <section className="border-t border-line bg-card">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 md:grid-cols-3">
          <Feature
            icon={Package}
            title="Entregas"
            text="O porteiro registra. O morador recebe o WhatsApp e assina na tela."
          />
          <Feature
            icon={Vote}
            title="Enquetes"
            text="Admin abre a votação. Cada unidade vota uma vez, pelo celular ou pelo painel."
          />
          <Feature
            icon={PieChart}
            title="Caixa"
            text="Moradores veem os gastos. Admin e síndico sobem o comprovante."
          />
        </div>
      </section>
    </main>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Package;
  title: string;
  text: string;
}) {
  return (
    <div>
      <span className="grid size-10 place-items-center rounded-xl bg-moss">
        <Icon className="size-5 text-pine" aria-hidden="true" />
      </span>
      <h2 className="mt-3 font-display text-lg">{title}</h2>
      <p className="mt-2 text-sm text-muted">{text}</p>
    </div>
  );
}

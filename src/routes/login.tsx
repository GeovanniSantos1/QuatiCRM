import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, signIn } from "@/lib/auth/client";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { errorText } from "@/lib/condo/format";
import { ArrowLeft, Building2, CheckCircle2, Package, ShieldCheck, Vote } from "lucide-react";
import { btnClay, field } from "@/components/app-shell";
import { QuatiMark } from "@/components/quati-mark";
import { getSocialLoginConfiguration } from "@/lib/condo/social-login";

export const Route = createFileRoute("/login")({
  component: Login,
  loader: () => getSocialLoginConfiguration(),
  validateSearch: (search: Record<string, unknown>): { convite?: string; cadastro?: boolean } => ({
    convite:
      typeof search.convite === "string" && /^[a-f0-9]{64}$/.test(search.convite)
        ? search.convite
        : undefined,
    cadastro: search.cadastro === true || search.cadastro === "true" || undefined,
  }),
});

function Login() {
  const { user, isPending } = useCurrentUserState();
  const router = useRouter();
  const search = Route.useSearch();
  const { appClientConfigured, clerkPublishableKey } = Route.useLoaderData();
  const destination = search.convite ? `/convite/${search.convite}` : "/painel";
  const [mode, setMode] = useState<"in" | "up">(search.cadastro ? "up" : "in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPending && user) return <RedirectToSignIn to={destination} />;

  async function submitSocial(providerId: string, label: string) {
    setError(null);
    if (
      providerId === "grok-google" &&
      clerkPublishableKey &&
      !window.location.hostname.endsWith(".grok-sandbox.com")
    ) {
      window.location.assign(
        search.convite ? `/auth/google?convite=${search.convite}` : "/auth/google",
      );
      return;
    }
    if (!appClientConfigured && !window.location.hostname.endsWith(".grok-sandbox.com")) {
      setError(
        `O login com ${label} ainda não está configurado para este endereço. Você pode entrar ou criar sua conta com e-mail e senha.`,
      );
      return;
    }
    setBusy(true);
    try {
      await signIn(providerId, { callbackURL: destination });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "up"
          ? await authClient.signUp.email({ email, password, name, callbackURL: destination })
          : await authClient.signIn.email({ email, password, callbackURL: destination });
      if (result.error) throw new Error(result.error.message || "Não foi possível entrar.");
      if (search.convite)
        await router.navigate({ to: "/convite/$token", params: { token: search.convite } });
      else await router.navigate({ to: "/painel" });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-card lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-pine-deep p-12 text-card lg:flex">
        <Link to="/" className="flex items-center gap-3 font-display text-3xl">
          <QuatiMark className="size-11" />
          quati.
        </Link>
        <div>
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-card/20 px-3 py-1 text-xs text-card/85">
            <Building2 className="size-3.5" aria-hidden="true" /> Gestão condominial simplificada
          </span>
          <h1 className="max-w-lg font-display text-5xl leading-tight">
            Mais organização.
            <br />
            Mais tranquilidade.
          </h1>
          <p className="mt-5 max-w-sm leading-relaxed text-card/75">
            Pessoas, entregas e decisões conectadas. Cuide do seu condomínio com tudo no mesmo
            lugar.
          </p>
          <div className="mt-10 space-y-5">
            {[
              { icon: Package, text: "Entregas com assinatura digital" },
              { icon: Vote, text: "Decisões com a participação de todos" },
              { icon: ShieldCheck, text: "Acesso de acordo com cada função" },
            ].map(({ icon: Icon, text }) => (
              <p key={text} className="flex items-center gap-3 text-sm text-card/90">
                <span className="grid size-9 place-items-center rounded-lg bg-card/10">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </p>
            ))}
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs text-card/65">
          <CheckCircle2 className="size-4" aria-hidden="true" /> Uma gestão mais próxima de quem
          mora.
        </p>
      </section>
      <section className="flex items-center bg-paper px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <Link
            to="/"
            className="mb-8 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-muted hover:text-pine"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> Voltar ao início
          </Link>
          <p className="text-xs font-bold tracking-widest text-pine uppercase">Condomínio Quati</p>
          <h2 className="mt-3 font-display text-3xl">
            {mode === "in" ? "Bem-vindo de volta" : "Crie sua conta"}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {mode === "in"
              ? "Acesse sua conta para acompanhar o condomínio."
              : "Crie sua conta e solicite a aprovação do cadastro à administração."}
          </p>
          <div className="mt-6 grid gap-2">
            {GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                disabled={busy || isPending}
                className="min-h-11 rounded-full border border-line bg-card text-sm font-semibold"
                onClick={() => void submitSocial(provider.providerId, provider.label)}
              >
                Continuar com {provider.label}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}
          <form onSubmit={submit} className="mt-6 space-y-3">
            {mode === "up" && (
              <label className="block text-sm font-medium">
                Nome completo
                <input
                  className={`${field} mt-1.5`}
                  autoComplete="name"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
            )}
            <label className="block text-sm font-medium">
              E-mail
              <input
                className={`${field} mt-1.5`}
                type="email"
                autoComplete="email"
                placeholder="voce@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm font-medium">
              Senha
              <input
                className={`${field} mt-1.5`}
                type="password"
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                placeholder="Pelo menos 8 caracteres"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={busy} className={`${btnClay} w-full`}>
              {busy ? "Aguarde…" : mode === "in" ? "Entrar com e-mail" : "Criar conta"}
            </button>
          </form>
          <button
            type="button"
            className="mt-4 min-h-11 text-sm text-muted"
            onClick={() => {
              setMode(mode === "in" ? "up" : "in");
              setError(null);
            }}
          >
            {mode === "in" ? "Ainda não tenho conta" : "Já tenho conta"}
          </button>
        </div>
      </section>
    </main>
  );
}

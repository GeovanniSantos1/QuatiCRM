import { ThemeSelector } from "@/components/theme-selector";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ShieldCheck, UserRoundCheck } from "lucide-react";
import { QuatiMark } from "@/components/quati-mark";
import { btnClay, btnGhost, Notice } from "@/components/app-shell";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { acceptResidentInvite, getResidentInvite } from "@/lib/condo/memberships";
import { errorText, formatWhen } from "@/lib/condo/format";
export const Route = createFileRoute("/convite/$token")({ component: Invite });
function Invite() {
  const { token } = Route.useParams();
  const router = useRouter();
  const { user, isPending } = useCurrentUserState();
  const [info, setInfo] = useState<Awaited<ReturnType<typeof getResidentInvite>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getResidentInvite({ data: { token } })
      .then((next) => {
        if (!cancelled) setInfo(next);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);
  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await acceptResidentInvite({ data: { token } });
      await router.navigate({ to: "/painel" });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-paper px-4 py-6 text-ink">
      <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <Link to="/" className="flex items-center gap-3">
          <QuatiMark />
          <span className="font-display text-2xl">quati.</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeSelector compact />
          {user && <UserButton />}
        </div>
      </header>
      <section className="mx-auto mt-10 max-w-lg space-y-5 rounded-2xl border border-line bg-card p-6">
        <span className="grid size-12 place-items-center rounded-xl bg-moss text-pine">
          <UserRoundCheck className="size-6" aria-hidden="true" />
        </span>
        <h1 className="font-display text-2xl">Você foi convidado para o Quati</h1>
        {error && <Notice tone="bad">{error}</Notice>}
        {!info && !error && (
          <p role="status" className="text-sm text-muted">
            Verificando convite…
          </p>
        )}
        {info && (
          <>
            <p className="text-sm text-muted">
              Olá, {info.fullName}. A administração preparou seu cadastro para a unidade{" "}
              <strong className="text-ink">{info.unit}</strong>.
            </p>
            <p className="flex items-center gap-2 rounded-xl bg-moss p-3 text-sm text-pine">
              <ShieldCheck className="size-5 shrink-0" aria-hidden="true" /> Seu cadastro já está
              aprovado. Falta ativar sua conta.
            </p>
            <p className="text-sm text-muted">
              Use o e-mail que recebeu o convite: <strong>{info.emailHint}</strong>. Você define sua
              própria senha.
            </p>
            <p className="text-xs text-muted">Convite válido até {formatWhen(info.expiresAt)}.</p>
            {isPending ? (
              <p className="text-sm text-muted">Verificando conta…</p>
            ) : user ? (
              <div className="space-y-3">
                <p className="text-xs text-muted">Conta conectada: {user.primaryEmail}</p>
                <button
                  className={`${btnClay} w-full`}
                  type="button"
                  disabled={busy}
                  onClick={() => void accept()}
                >
                  {busy ? "Ativando…" : "Ativar meu cadastro"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Link to="/login" search={{ convite: token, cadastro: true }} className={btnClay}>
                  Criar minha conta e continuar
                </Link>
                <Link to="/login" search={{ convite: token }} className={btnGhost}>
                  Já tenho conta
                </Link>
              </div>
            )}
          </>
        )}
        {!info && error && (
          <Link to="/" className={btnGhost}>
            Voltar ao início
          </Link>
        )}
      </section>
    </main>
  );
}

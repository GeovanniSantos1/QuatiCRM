import { useState, type FormEvent } from "react";
import { Clock3, RefreshCw, ShieldCheck, UserRound, XCircle } from "lucide-react";
import { UserButton } from "@/lib/auth/gates";
import { QuatiMark } from "@/components/quati-mark";
import { getMembershipAccess, submitResidentRegistration } from "@/lib/condo/memberships";
import { errorText } from "@/lib/condo/format";

type Access = Awaited<ReturnType<typeof getMembershipAccess>>;
const inputClass = "mt-1.5 min-h-11 w-full rounded-xl border border-line bg-card px-3 text-base";
const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-50";

export function ResidentRegistrationGate({
  access,
  onRefresh,
}: {
  access: Access;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(!access.requestedAt || access.status === "recusado");
  const [name, setName] = useState(access.profile.fullName);
  const [unit, setUnit] = useState(access.profile.unit);
  const [phone, setPhone] = useState(access.profile.phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = access.status === "aprovado" && !access.profile.active;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submitResidentRegistration({ data: { fullName: name, unit, phone } });
      setEditing(false);
      onRefresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-paper px-4 py-6 text-ink">
      <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <span className="flex items-center gap-3">
          <QuatiMark />
          <span className="font-display text-2xl">quati.</span>
        </span>
        <UserButton />
      </header>
      <section className="mx-auto mt-8 max-w-xl space-y-5">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-moss text-pine">
            <UserRound className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-widest text-pine uppercase">
              Condomínio Quati
            </p>
            <h1 className="mt-1 font-display text-2xl">Cadastro de morador</h1>
          </div>
        </div>
        <div
          className={`rounded-2xl border p-5 ${disabled || access.status === "recusado" ? "border-danger/20 bg-danger-soft text-danger" : "border-line bg-card text-ink"}`}
          role="status"
        >
          <div className="flex items-center gap-2">
            {disabled || access.status === "recusado" ? (
              <XCircle className="size-5 shrink-0" aria-hidden="true" />
            ) : access.requestedAt ? (
              <Clock3 className="size-5 shrink-0 text-pine" aria-hidden="true" />
            ) : (
              <ShieldCheck className="size-5 shrink-0 text-pine" aria-hidden="true" />
            )}
            <h2 className="font-semibold">
              {disabled
                ? "Acesso desativado"
                : access.status === "recusado"
                  ? "Cadastro não aprovado"
                  : access.requestedAt
                    ? "Cadastro em análise"
                    : "Solicite seu acesso ao condomínio"}
            </h2>
          </div>
          <p className="mt-2 text-sm">
            {disabled
              ? "Fale com a administração para revisar seu acesso."
              : access.status === "recusado"
                ? `Motivo: ${access.reason}`
                : access.requestedAt
                  ? "Seu pedido foi enviado. Um admin ou a síndica precisa aprová-lo antes de você acessar os dados do condomínio."
                  : "Sua conta foi criada. Informe seus dados para enviar o pedido à administração."}
          </p>
          {access.requestedAt && access.status === "pendente" && (
            <p className="mt-3 text-sm text-muted">
              {access.profile.fullName} · Unidade {access.profile.unit}
            </p>
          )}
        </div>
        {!disabled && editing && (
          <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-card p-5">
            <h2 className="font-display text-lg">Dados do morador</h2>
            <label className="block text-sm font-medium">
              Nome completo
              <input
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
              />
            </label>
            <label className="block text-sm font-medium">
              Unidade / apartamento
              <input
                className={inputClass}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                required
                maxLength={40}
                placeholder="Ex.: Bloco A 101"
              />
            </label>
            <label className="block text-sm font-medium">
              WhatsApp com DDD
              <input
                className={inputClass}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                maxLength={24}
                placeholder="(11) 99999-9999"
                autoComplete="tel"
              />
            </label>
            <p className="text-xs text-muted">E-mail da conta: {access.profile.email}</p>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className={`${buttonClass} w-full bg-pine text-card`}
            >
              {busy
                ? "Enviando…"
                : access.status === "recusado"
                  ? "Enviar novamente para análise"
                  : access.requestedAt
                    ? "Atualizar solicitação"
                    : "Solicitar aprovação"}
            </button>
            <p className="text-xs text-muted">
              O acesso será liberado somente após a aprovação da administração.
            </p>
          </form>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${buttonClass} border border-line bg-card text-ink`}
            onClick={onRefresh}
          >
            <RefreshCw className="size-4" aria-hidden="true" /> Verificar situação
          </button>
          {!disabled && !editing && (
            <button
              type="button"
              className={`${buttonClass} text-pine`}
              onClick={() => setEditing(true)}
            >
              Corrigir dados
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

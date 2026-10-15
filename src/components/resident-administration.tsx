import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, Mail, MessageCircle, RefreshCw, Send, UserPlus, X } from "lucide-react";
import { btnClay, btnGhost, field, Notice } from "@/components/app-shell";
import {
  createResidentInvite,
  listResidentAdministration,
  manageResidentInvite,
  reviewResidentRegistration,
} from "@/lib/condo/memberships";
import { errorText, formatWhen, waLink } from "@/lib/condo/format";

type Pack = Awaited<ReturnType<typeof listResidentAdministration>>;
type Request = Pack["requests"][number];
type Invitation = Pack["invitations"][number];
type Share = {
  id: string;
  token: string;
  fullName: string;
  email: string;
  phone: string;
  unit: string;
  expiresAt: string | null;
};

export function ResidentAdministration({ onChange }: { onChange: () => void }) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<"pedidos" | "novo" | "convites">("pedidos");
  const [share, setShare] = useState<Share | null>(null);
  useEffect(() => {
    let cancelled = false;
    listResidentAdministration()
      .then((next) => {
        if (!cancelled) {
          setPack(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);
  const refresh = () => setTick((n) => n + 1);
  const pending = pack?.requests.filter((r) => r.status === "pendente") || [];
  return (
    <section className="space-y-4 rounded-3xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2>Cadastros e convites</h2>
          <p className="mt-1 text-sm text-muted">
            Aprove os pedidos ou prepare o cadastro de um novo morador.
          </p>
        </div>
        <button type="button" className={btnGhost} onClick={refresh}>
          <RefreshCw className="size-4" aria-hidden="true" /> Atualizar cadastros
        </button>
      </div>
      <div
        aria-label="Gerenciar moradores"
        className="flex flex-wrap gap-2 border-b border-line pb-4"
      >
        {[
          {
            key: "pedidos" as const,
            label: `Solicitações${pending.length ? ` (${pending.length})` : ""}`,
          },
          { key: "novo" as const, label: "Cadastrar morador" },
          { key: "convites" as const, label: "Convites" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={tab === item.key}
            className={tab === item.key ? btnClay : btnGhost}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {!pack && !error && (
        <p role="status" className="text-sm text-muted">
          Carregando cadastros…
        </p>
      )}
      {tab === "pedidos" && pack && (
        <div className="space-y-4">
          {pending.length === 0 ? (
            <div className="rounded-xl bg-paper p-5 text-center">
              <Check className="mx-auto mb-2 size-6 text-pine" aria-hidden="true" />
              <h3 className="font-semibold">Nenhum cadastro aguardando análise</h3>
              <p className="mt-1 text-sm text-muted">
                Os moradores podem solicitar acesso pelo cadastro do site.
              </p>
            </div>
          ) : (
            pending.map((request) => (
              <RegistrationReview
                key={`${request.userId}:${request.version}`}
                request={request}
                onDone={() => {
                  refresh();
                  onChange();
                }}
              />
            ))
          )}
          {pack.requests.some((r) => r.status === "recusado") && (
            <details className="rounded-xl border border-line p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Cadastros recusados
              </summary>
              <ul className="mt-3 divide-y divide-line">
                {pack.requests
                  .filter((r) => r.status === "recusado")
                  .map((r) => (
                    <li key={r.userId} className="py-3 text-sm">
                      <p className="font-semibold">
                        {r.fullName} · {r.unit}
                      </p>
                      <p className="text-muted">{r.email}</p>
                      <p className="mt-1 text-danger">Motivo: {r.reason}</p>
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {tab === "novo" && (
        <NewResidentInvite
          onCreated={(value) => {
            setShare(value);
            refresh();
          }}
        />
      )}
      {tab === "convites" && pack && (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Convites pendentes e até 100 encerrados. Renovar um link invalida o anterior; o novo
            convite vale por 7 dias.
          </p>
          {pack.invitations.length === 0 ? (
            <p className="rounded-xl bg-paper p-5 text-sm text-muted">
              Nenhum convite criado. Use “Cadastrar morador” para começar.
            </p>
          ) : (
            pack.invitations.map((invite) => (
              <InvitationCard
                key={invite.id}
                invite={invite}
                onShare={(value) => {
                  setShare(value);
                  refresh();
                }}
                onRevoked={() => {
                  if (share?.id === invite.id) setShare(null);
                  refresh();
                }}
              />
            ))
          )}
        </div>
      )}
      {share && <InvitationShare key={share.token} share={share} onClose={() => setShare(null)} />}
    </section>
  );
}

function RegistrationReview({ request: r, onDone }: { request: Request; onDone: () => void }) {
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(decision: "aprovado" | "recusado") {
    setBusy(true);
    setError(null);
    try {
      await reviewResidentRegistration({
        data: { userId: r.userId, version: r.version, decision, reason },
      });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="space-y-4 rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{r.fullName}</h3>
          <p className="mt-1 text-sm text-muted">{r.email}</p>
        </div>
        <span className="rounded-md bg-paper px-2 py-1 text-xs font-semibold text-muted">
          Aguardando aprovação
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Unidade</dt>
          <dd>{r.unit}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">WhatsApp</dt>
          <dd>{r.phone}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted">Solicitado em {formatWhen(r.requestedAt)}</p>
      {error && <Notice tone="bad">{error}</Notice>}
      {reject ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void decide("recusado");
          }}
        >
          <label className="block text-sm">
            Motivo da recusa
            <textarea
              className={`${field} mt-1.5 min-h-24 py-3`}
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={`${btnGhost} text-danger`} disabled={busy}>
              {busy ? "Salvando…" : "Confirmar recusa"}
            </button>
            <button
              type="button"
              className={btnGhost}
              disabled={busy}
              onClick={() => setReject(false)}
            >
              Voltar
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnClay}
            disabled={busy}
            onClick={() => void decide("aprovado")}
          >
            <Check className="size-4" aria-hidden="true" />
            {busy ? "Salvando…" : "Aprovar morador"}
          </button>
          <button
            type="button"
            className={`${btnGhost} text-danger`}
            disabled={busy}
            onClick={() => setReject(true)}
          >
            <X className="size-4" aria-hidden="true" /> Recusar cadastro
          </button>
        </div>
      )}
    </article>
  );
}

function NewResidentInvite({ onCreated }: { onCreated: (share: Share) => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [unit, setUnit] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await createResidentInvite({ data: { fullName, email, unit, phone } });
      onCreated({ ...result, fullName, email, unit, phone });
      setFullName("");
      setEmail("");
      setUnit("");
      setPhone("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h3 className="font-semibold">Pré-cadastrar e convidar morador</h3>
        <p className="mt-1 text-sm text-muted">
          O cadastro fica pré-aprovado. O morador recebe o link e cria a própria senha para ativar o
          acesso.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          Nome completo
          <input
            className={`${field} mt-1.5`}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
        </label>
        <label className="block text-sm">
          E-mail do morador
          <input
            className={`${field} mt-1.5`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={200}
          />
        </label>
        <label className="block text-sm">
          Unidade / apartamento
          <input
            className={`${field} mt-1.5`}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            required
            maxLength={40}
            placeholder="Ex.: Bloco A 101"
          />
        </label>
        <label className="block text-sm">
          WhatsApp com DDD
          <input
            className={`${field} mt-1.5`}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            maxLength={24}
            placeholder="(11) 99999-9999"
          />
        </label>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <button type="submit" className={btnClay} disabled={busy}>
        <UserPlus className="size-4" aria-hidden="true" />
        {busy ? "Criando…" : "Criar convite aprovado"}
      </button>
    </form>
  );
}

function InvitationCard({
  invite: i,
  onShare,
  onRevoked,
}: {
  invite: Invitation;
  onShare: (share: Share) => void;
  onRevoked: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function action(value: "renovar" | "revogar") {
    setBusy(true);
    setError(null);
    try {
      const result = await manageResidentInvite({ data: { id: i.id, action: value } });
      if (result.token) onShare({ ...i, token: result.token, expiresAt: result.expiresAt });
      else onRevoked();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="space-y-3 rounded-xl border border-line p-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="font-semibold">{i.fullName}</h3>
          <p className="text-sm text-muted">
            {i.email} · {i.unit}
          </p>
        </div>
        <span className="self-start rounded-md bg-paper px-2 py-1 text-xs font-semibold text-muted">
          {i.status === "utilizado"
            ? "Ativado"
            : i.status === "revogado"
              ? "Revogado"
              : i.expired
                ? "Expirado"
                : "Aguardando ativação"}
        </span>
      </div>
      <p className="text-xs text-muted">Válido até {formatWhen(i.expiresAt)}</p>
      {error && <Notice tone="bad">{error}</Notice>}
      {i.status === "pendente" && (
        <div className="flex flex-wrap gap-2">
          {confirm ? (
            <>
              <p className="w-full text-sm text-danger">
                Revogar este convite impede sua ativação.
              </p>
              <button
                type="button"
                disabled={busy}
                className={`${btnGhost} text-danger`}
                onClick={() => void action("revogar")}
              >
                Confirmar revogação
              </button>
              <button
                type="button"
                className={btnGhost}
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Voltar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={btnGhost}
                disabled={busy}
                onClick={() => void action("renovar")}
              >
                {busy ? "Gerando…" : "Gerar novo link"}
              </button>
              <button
                type="button"
                className={`${btnGhost} text-danger`}
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                Revogar convite
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function InvitationShare({ share: s, onClose }: { share: Share; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = `${window.location.origin}/convite/${s.token}`;
  const message = `Olá, ${s.fullName}! Seu cadastro para a unidade ${s.unit} no Condomínio Quati foi aprovado pela administração. Crie sua conta com o e-mail ${s.email} e ative seu acesso: ${url}`;
  const whatsapp = waLink(s.phone, message);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setError(null);
    } catch {
      setError("Selecione o link abaixo e copie para compartilhar.");
    }
  }
  return (
    <div className="space-y-3 rounded-xl border border-pine/20 bg-moss p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-pine">
            <Send className="size-4" aria-hidden="true" /> Convite pronto para compartilhar
          </h3>
          <p className="mt-1 text-sm text-muted">
            {s.fullName} · {s.unit}
          </p>
        </div>
        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-pine hover:bg-card"
          aria-label="Fechar compartilhamento"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <label className="block text-xs text-muted">
        Link de ativação
        <input
          readOnly
          className={`${field} mt-1.5`}
          value={url}
          onFocus={(e) => e.target.select()}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnGhost} onClick={() => void copy()}>
          <Copy className="size-4" aria-hidden="true" />
          {copied ? "Link copiado" : "Copiar link"}
        </button>
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noreferrer" className={btnClay}>
            <MessageCircle className="size-4" aria-hidden="true" /> Enviar por WhatsApp
          </a>
        )}
        <a
          className={btnGhost}
          href={`mailto:${s.email}?subject=${encodeURIComponent("Seu convite para o Condomínio Quati")}&body=${encodeURIComponent(message)}`}
        >
          <Mail className="size-4" aria-hidden="true" /> Enviar por e-mail
        </a>
      </div>
      {error && (
        <p role="status" className="text-sm text-muted">
          {error}
        </p>
      )}
      <p className="text-xs text-muted">
        Válido até {formatWhen(s.expiresAt)}. Compartilhe somente com o morador. Os botões abrem o
        WhatsApp ou seu aplicativo de e-mail para concluir o envio.
      </p>
    </div>
  );
}

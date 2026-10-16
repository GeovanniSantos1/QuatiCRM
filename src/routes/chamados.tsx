import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardList, Plus, RefreshCw, Send, ArrowLeft } from "lucide-react";
import { AppShell, Notice, btnPine, btnGhost, field, useQuati } from "@/components/app-shell";
import {
  OpsEmpty,
  OpsStats,
  StatusTag,
  opsCard,
  opsLabel,
  opsDate,
} from "@/components/operations-ui";
import {
  createTicket,
  listTickets,
  getTicket,
  sendTicketMessage,
  updateTicket,
} from "@/lib/condo/operations";
import { TICKET_CATEGORIES, TICKET_STATUS, PRIORITIES } from "@/lib/condo/operations-rules";
import { errorText } from "@/lib/condo/format";

export const Route = createFileRoute("/chamados")({
  component: Page,
  validateSearch: (search: Record<string, unknown>): { id?: string } => ({
    id: typeof search.id === "string" && search.id.length <= 80 ? search.id : undefined,
  }),
});
function Page() {
  return (
    <AppShell>
      <Tickets />
    </AppShell>
  );
}
type Ticket = Awaited<ReturnType<typeof listTickets>>["tickets"][number];
const statusLabel = (status: string) =>
  TICKET_STATUS[status as keyof typeof TICKET_STATUS] || status;
function Tickets() {
  const { refresh } = useQuati();
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof listTickets>> | null>(null);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("todos");
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState("");
  useEffect(() => {
    let ignore = false;
    listTickets()
      .then((next) => {
        if (!ignore) {
          setData(next);
          setError("");
        }
      })
      .catch((e) => {
        if (!ignore) setError(errorText(e));
      });
    return () => {
      ignore = true;
    };
  }, [tick]);
  const changed = () => {
    setTick((n) => n + 1);
    refresh();
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-pine uppercase">
            Cuidado com o condomínio
          </p>
          <h1 className="mt-2 font-display text-3xl">Chamados e manutenção</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Registre um problema e acompanhe a solução. As conversas ficam entre o autor e a
            administração.
          </p>
        </div>
        <button className={btnPine} onClick={() => setCreating((v) => !v)}>
          <Plus className="size-4" aria-hidden="true" />
          {creating ? "Fechar formulário" : "Novo chamado"}
        </button>
      </div>
      {error && (
        <Notice tone="bad">
          {error}{" "}
          <button className="min-h-11 underline" onClick={() => setTick((n) => n + 1)}>
            Tentar novamente
          </button>
        </Notice>
      )}
      {success && (
        <p role="status" className="text-sm font-semibold text-pine">
          {success}
        </p>
      )}
      {creating && (
        <NewTicket
          onCreated={(ticketId) => {
            setCreating(false);
            setSuccess("Chamado enviado. A administração foi avisada.");
            changed();
            void navigate({ search: { id: ticketId } });
          }}
        />
      )}
      {!data && !error && (
        <p role="status" className="text-sm text-muted">
          Carregando chamados…
        </p>
      )}
      {data && (
        <>
          <OpsStats
            items={[
              { label: "Abertos", value: data.tickets.filter((t) => t.status === "aberto").length },
              {
                label: "Em andamento",
                value: data.tickets.filter((t) => t.status === "em_andamento").length,
              },
              {
                label: "Resolvidos",
                value: data.tickets.filter((t) => t.status === "resolvido").length,
              },
            ]}
          />
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <section className={`${opsCard} ${id ? "hidden xl:block" : ""}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold">
                  {data.manager ? "Chamados do condomínio" : "Meus chamados"}
                </h2>
                <button className={btnGhost} aria-label="Atualizar chamados" onClick={changed}>
                  <RefreshCw className="size-4" aria-hidden="true" />
                </button>
              </div>
              <label className={opsLabel}>
                Filtrar situação
                <select
                  className={`${field} mt-2 mb-4`}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="todos">Todas as situações</option>
                  {Object.entries(TICKET_STATUS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-3">
                {data.tickets
                  .filter((t) => filter === "todos" || t.status === filter)
                  .map((ticket) => (
                    <Link
                      key={ticket.id}
                      to="/chamados"
                      search={{ id: ticket.id }}
                      aria-current={id === ticket.id ? "true" : undefined}
                      className={`block rounded-xl border p-4 transition-colors hover:bg-paper ${id === ticket.id ? "border-pine bg-moss/40" : "border-line"}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusTag
                          quiet={ticket.status === "resolvido" || ticket.status === "cancelado"}
                        >
                          {statusLabel(ticket.status)}
                        </StatusTag>
                        <span
                          className={`text-xs font-semibold ${ticket.priority === "alta" ? "text-danger" : "text-muted"}`}
                        >
                          Prioridade{" "}
                          {PRIORITIES[ticket.priority as keyof typeof PRIORITIES].toLowerCase()}
                        </span>
                      </div>
                      <h3 className="mt-3 font-bold break-words">{ticket.title}</h3>
                      <p className="mt-1 text-xs text-muted">
                        {TICKET_CATEGORIES[ticket.category as keyof typeof TICKET_CATEGORIES]} ·{" "}
                        {ticket.unit || "Área comum"}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        {ticket.residentName} · {opsDate(ticket.updatedAt)}
                      </p>
                      <span className="mt-3 inline-block text-xs font-bold text-pine">
                        Ver chamado e mensagens →
                      </span>
                    </Link>
                  ))}
              </div>
              {!data.tickets.some((t) => filter === "todos" || t.status === filter) && (
                <OpsEmpty>Nenhum chamado nesta situação.</OpsEmpty>
              )}
              <p className="mt-4 text-xs text-muted">
                Até 200 chamados recentes, com pendências primeiro.
              </p>
            </section>
            {id ? (
              <TicketDetail
                key={id}
                id={id}
                tick={tick}
                manager={data.manager}
                onChanged={changed}
              />
            ) : (
              <section className={opsCard}>
                <ClipboardList className="mb-3 size-7 text-pine" aria-hidden="true" />
                <h2 className="font-bold">Uma conversa, do início à solução</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Selecione um chamado para ler as respostas, conversar com a administração e
                  acompanhar cada mudança de situação.
                </p>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
function NewTicket({ onCreated }: { onCreated: (id: string) => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className={`${opsCard} space-y-4`}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        setBusy(true);
        setError("");
        try {
          const ticket = await createTicket({
            data: {
              title: String(values.get("title")),
              description: String(values.get("description")),
              category: String(values.get("category")) as "manutencao",
              priority: String(values.get("priority")) as "normal",
            },
          });
          onCreated(ticket.id);
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-bold">O que precisa de atenção?</h2>
      <label className={opsLabel}>
        Assunto
        <input
          name="title"
          className={`${field} mt-2`}
          required
          minLength={5}
          maxLength={120}
          placeholder="Ex.: iluminação do corredor do bloco A"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={opsLabel}>
          Categoria
          <select name="category" className={`${field} mt-2`}>
            {Object.entries(TICKET_CATEGORIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className={opsLabel}>
          Prioridade
          <select name="priority" defaultValue="normal" className={`${field} mt-2`}>
            {Object.entries(PRIORITIES).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={opsLabel}>
        Descrição
        <textarea
          name="description"
          className={`${field} mt-2 min-h-28 py-3`}
          minLength={10}
          maxLength={3000}
          required
          placeholder="Informe o local e explique o que aconteceu."
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button className={btnPine} disabled={busy}>
        {busy ? "Enviando…" : "Enviar chamado"}
      </button>
    </form>
  );
}
function TicketDetail({
  id,
  tick,
  manager,
  onChanged,
}: {
  id: string;
  tick: number;
  manager: boolean;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getTicket>> | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [body, setBody] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let ignore = false;
    getTicket({ data: { id } })
      .then((next) => {
        if (!ignore) {
          setDetail(next);
          setError("");
        }
      })
      .catch((e) => {
        if (!ignore) setError(errorText(e));
      });
    return () => {
      ignore = true;
    };
  }, [id, tick]);
  useEffect(() => {
    if (detail) heading.current?.focus({ preventScroll: true });
  }, [detail?.ticket.id]);
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const ticket = detail?.ticket;
  return (
    <section className={`${opsCard} space-y-5`} aria-label="Detalhes do chamado">
      <div className="flex items-center justify-between gap-2">
        <Link to="/chamados" className="inline-flex min-h-11 items-center gap-2 text-xs text-muted">
          <ArrowLeft className="size-4" aria-hidden="true" /> Fechar detalhes
        </Link>
        <button
          className={btnGhost}
          disabled={busy}
          aria-label="Atualizar conversa"
          onClick={onChanged}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {!detail && !error && <p role="status">Carregando conversa…</p>}
      {ticket && detail && (
        <>
          <div>
            <h2 ref={heading} tabIndex={-1} className="text-xl font-bold break-words outline-none">
              {ticket.title}
            </h2>
            <p className="mt-2 text-xs text-muted">
              {ticket.residentName} · {ticket.unit || "Área comum"} · {opsDate(ticket.createdAt)}
            </p>
            <div className="mt-3">
              <StatusTag>{statusLabel(ticket.status)}</StatusTag>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed break-words">
            {ticket.description}
          </p>
          <div className="border-t border-line pt-4">
            <h3 className="mb-3 text-sm font-bold">Histórico de atendimento</h3>
            {detail.events.length === 100 && (
              <p className="mb-3 text-xs text-muted">
                Mostrando as 100 atualizações mais recentes.
              </p>
            )}
            <ol className="space-y-3">
              {detail.events.map((event) => (
                <li key={event.id} className="border-l-2 border-moss pl-3 text-sm">
                  <p className="font-semibold">{statusLabel(event.status)}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-muted">{event.note}</p>
                  <p className="mt-1 text-xs text-muted">
                    {event.author} · {opsDate(event.at)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <div className="border-t border-line pt-4">
            <h3 className="mb-3 text-sm font-bold">Conversa</h3>
            {detail.messages.length === 200 && (
              <p className="mb-3 text-xs text-muted">Mostrando as 200 mensagens mais recentes.</p>
            )}
            <div className="space-y-3">
              {detail.messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-xl p-3 ${message.mine ? "bg-moss" : "bg-paper"}`}
                >
                  <p className="text-xs font-bold">
                    {message.author}
                    {message.mine ? " · você" : ""}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm break-words">{message.body}</p>
                  <p className="mt-2 text-xs text-muted">{opsDate(message.at)}</p>
                </div>
              ))}
              {!detail.messages.length && (
                <p className="text-sm text-muted">Nenhuma mensagem por enquanto.</p>
              )}
            </div>
            {["aberto", "em_andamento"].includes(ticket.status) ? (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    await sendTicketMessage({ data: { id, body } });
                    setBody("");
                  });
                }}
              >
                <label className={opsLabel}>
                  Sua mensagem
                  <textarea
                    className={`${field} mt-2 min-h-24 py-3`}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    required
                    maxLength={2000}
                  />
                </label>
                <button className={btnGhost} disabled={busy}>
                  <Send className="size-4" aria-hidden="true" />
                  {busy ? "Aguarde…" : "Enviar mensagem"}
                </button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-muted">
                Conversa encerrada. A administração pode reabrir o chamado.
              </p>
            )}
          </div>
          {(manager || (ticket.mine && ticket.status === "aberto")) && (
            <TicketDecision
              key={`${ticket.id}:${ticket.version}`}
              ticket={ticket}
              manager={manager}
              busy={busy}
              onSave={(status, note) =>
                void act(() =>
                  updateTicket({ data: { id, version: ticket.version, status, note } }),
                )
              }
            />
          )}
        </>
      )}
    </section>
  );
}
function TicketDecision({
  ticket,
  manager,
  busy,
  onSave,
}: {
  ticket: Ticket;
  manager: boolean;
  busy: boolean;
  onSave: (status: keyof typeof TICKET_STATUS, note: string) => void;
}) {
  const [status, setStatus] = useState<keyof typeof TICKET_STATUS>(
    manager ? (ticket.status as keyof typeof TICKET_STATUS) : "cancelado",
  );
  const [note, setNote] = useState("");
  return (
    <form
      className="space-y-3 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(status, note);
      }}
    >
      <h3 className="text-sm font-bold">
        {manager ? "Atualizar atendimento" : "Cancelar chamado"}
      </h3>
      {manager && (
        <label className={opsLabel}>
          Nova situação
          <select
            aria-label="Nova situação"
            className={`${field} mt-2`}
            value={status}
            onChange={(e) => setStatus(e.target.value as keyof typeof TICKET_STATUS)}
          >
            {Object.entries(TICKET_STATUS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={opsLabel}>
        Motivo ou solução
        <textarea
          className={`${field} mt-2 min-h-24 py-3`}
          required
          minLength={3}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <button className={btnPine} disabled={busy || status === ticket.status}>
        {busy ? "Salvando…" : manager ? "Atualizar situação" : "Confirmar cancelamento"}
      </button>
    </form>
  );
}

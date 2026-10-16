import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Plus, RefreshCw, Settings2, Users } from "lucide-react";
import { AppShell, Notice, btnPine, btnGhost, field, useQuati } from "@/components/app-shell";
import {
  OpsEmpty,
  OpsStats,
  StatusTag,
  opsCard,
  opsLabel,
  dayLabel,
} from "@/components/operations-ui";
import {
  listReservations,
  requestReservation,
  reviewReservation,
  saveArea,
} from "@/lib/condo/operations";
import {
  BOOKING_STATUS,
  minuteLabel,
  parseMinute,
  saoPauloDate,
} from "@/lib/condo/operations-rules";
import { errorText } from "@/lib/condo/format";

export const Route = createFileRoute("/reservas")({ component: Page });
function Page() {
  return (
    <AppShell>
      <Reservations />
    </AppShell>
  );
}
type ReservationsData = Awaited<ReturnType<typeof listReservations>>;
type Area = ReservationsData["areas"][number];
type Reservation = ReservationsData["reservations"][number];
const statusLabel = (status: string) =>
  BOOKING_STATUS[status as keyof typeof BOOKING_STATUS] || status;
function Reservations() {
  const { data: condo, refresh } = useQuati();
  const [data, setData] = useState<ReservationsData | null>(null),
    [date, setDate] = useState(saoPauloDate()),
    [tick, setTick] = useState(0);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false),
    [configuring, setConfiguring] = useState(false),
    [filter, setFilter] = useState("todos");
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    listReservations({ data: { date } })
      .then((next) => {
        if (!ignore) {
          setData(next);
          setError("");
        }
      })
      .catch((e) => {
        if (!ignore) setError(errorText(e));
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [date, tick]);
  const changed = (message = "") => {
    setTick((n) => n + 1);
    refresh();
    if (message) setSuccess(message);
  };
  const activeAreas = data?.areas.filter((a) => a.active) || [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-pine uppercase">
            Espaços para compartilhar
          </p>
          <h1 className="mt-2 font-display text-3xl">Reservas de áreas comuns</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Consulte a disponibilidade e acompanhe a aprovação. Todos os horários são de São Paulo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data?.manager && (
            <button className={btnGhost} onClick={() => setConfiguring((v) => !v)}>
              <Settings2 className="size-4" aria-hidden="true" />
              {configuring ? "Fechar configuração" : "Gerenciar áreas"}
            </button>
          )}
          {data && !data.guard && (
            <button
              className={btnPine}
              disabled={!activeAreas.length}
              onClick={() => setCreating((v) => !v)}
            >
              <Plus className="size-4" aria-hidden="true" />
              {creating ? "Fechar formulário" : "Solicitar reserva"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <Notice tone="bad">
          {error}{" "}
          <button className="min-h-11 underline" onClick={() => changed()}>
            Tentar novamente
          </button>
        </Notice>
      )}
      {success && (
        <p role="status" className="text-sm font-semibold text-pine">
          {success}
        </p>
      )}
      {!data && loading && (
        <p role="status" className="text-sm text-muted">
          Carregando reservas…
        </p>
      )}
      {data && (
        <>
          {configuring && data.manager && (
            <AreaManager
              areas={data.areas}
              onSaved={() => changed("Área atualizada. As reservas existentes foram mantidas.")}
            />
          )}
          {!activeAreas.length && (
            <Notice>
              {data.manager
                ? "Cadastre a primeira área em “Gerenciar áreas” para receber reservas."
                : "A administração ainda não disponibilizou áreas para reserva."}
            </Notice>
          )}
          {creating && !data.guard && activeAreas.length > 0 && (
            <BookingForm
              areas={activeAreas}
              date={date}
              onDate={setDate}
              unit={condo?.profile.unit || ""}
              onCreated={() => {
                setCreating(false);
                changed(
                  "Reserva solicitada. O período está reservado enquanto a administração analisa o pedido.",
                );
              }}
            />
          )}
          <OpsStats
            items={[
              {
                label: data.guard ? "Aprovadas no dia" : "Aguardando análise",
                value: data.reservations.filter(
                  (r) => r.status === (data.guard ? "aprovado" : "pendente"),
                ).length,
              },
              {
                label: "Aprovadas",
                value: data.reservations.filter((r) => r.status === "aprovado").length,
              },
              { label: "Áreas disponíveis", value: activeAreas.length },
            ]}
          />
          <section className={opsCard}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <CalendarDays className="size-5 text-pine" aria-hidden="true" /> Agenda de
                  ocupação
                </h2>
                <p className="mt-1 text-xs text-muted">
                  Pedidos pendentes também bloqueiam o período. Intervalos de 15 minutos.
                </p>
              </div>
              <div className="flex items-end gap-2">
                <label className={opsLabel}>
                  Data da agenda
                  <input
                    type="date"
                    className={`${field} mt-2`}
                    value={date}
                    onChange={(e) => {
                      if (e.target.value) setDate(e.target.value);
                    }}
                    required
                  />
                </label>
                <button
                  className={btnGhost}
                  aria-label="Atualizar reservas"
                  onClick={() => changed()}
                  disabled={loading}
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            {loading ? (
              <p role="status" className="mt-5 text-sm text-muted">
                Atualizando agenda…
              </p>
            ) : (
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {activeAreas.map((area) => (
                  <div key={area.id} className="rounded-xl border border-line p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold break-words">{area.name}</h3>
                        <p className="mt-1 text-xs text-muted">
                          {minuteLabel(area.opens)}–{minuteLabel(area.closes)} · até {area.capacity}{" "}
                          pessoas
                        </p>
                      </div>
                      <Users className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    </div>
                    {area.description && (
                      <p className="mt-2 text-xs leading-relaxed break-words text-muted">
                        {area.description}
                      </p>
                    )}
                    <ul className="mt-3 space-y-2">
                      {data.agenda
                        .filter((r) => r.areaId === area.id)
                        .map((r, i) => (
                          <li
                            key={`${r.start}:${i}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-paper px-3 py-2"
                          >
                            <span className="text-sm font-semibold tabular-nums">
                              {minuteLabel(r.start)}–{minuteLabel(r.end)}
                            </span>
                            <StatusTag quiet={r.status === "pendente"}>
                              {r.status === "pendente" ? "Em análise" : "Ocupado"}
                            </StatusTag>
                          </li>
                        ))}
                    </ul>
                    {!data.agenda.some((r) => r.areaId === area.id) && (
                      <p className="mt-3 text-sm font-medium text-pine">Sem reservas neste dia.</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className={opsCard}>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold">
                  {data.manager
                    ? "Solicitações e reservas"
                    : data.guard
                      ? "Reservas aprovadas para a portaria"
                      : "Minhas reservas"}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {data.guard
                    ? `Consulta de ${dayLabel(date)}.`
                    : "Até 200 registros recentes, com pedidos pendentes primeiro."}
                </p>
              </div>
              <label className={opsLabel}>
                Situação
                <select
                  className={`${field} mt-2`}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="todos">Todas as situações</option>
                  {Object.entries(BOOKING_STATUS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {data.reservations
                .filter((r) => filter === "todos" || r.status === filter)
                .map((reservation) => (
                  <ReservationCard
                    key={`${reservation.id}:${reservation.version}`}
                    reservation={reservation}
                    manager={data.manager}
                    guard={data.guard}
                    onChanged={() => changed("Reserva atualizada.")}
                  />
                ))}
            </div>
            {!data.reservations.some((r) => filter === "todos" || r.status === filter) && (
              <OpsEmpty>Nenhuma reserva nesta situação.</OpsEmpty>
            )}
          </section>
        </>
      )}
    </div>
  );
}
function BookingForm({
  areas,
  date,
  onDate,
  unit,
  onCreated,
}: {
  areas: Area[];
  date: string;
  onDate: (date: string) => void;
  unit: string;
  onCreated: () => void;
}) {
  const [areaId, setAreaId] = useState(areas[0]?.id || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const area = areas.find((a) => a.id === areaId) || areas[0];
  return (
    <form
      className={`${opsCard} space-y-4`}
      onSubmit={async (event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        setBusy(true);
        setError("");
        try {
          await requestReservation({
            data: {
              areaId: area.id,
              date,
              start: parseMinute(String(values.get("start"))),
              end: parseMinute(String(values.get("end"))),
              purpose: String(values.get("purpose")),
              guests: Number(values.get("guests")),
            },
          });
          onCreated();
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <h2 className="font-bold">Solicitar uma reserva</h2>
        <p className="mt-1 text-xs text-muted">
          Unidade {unit || "não informada"} · aprovação de admin ou síndico · até 90 dias à frente.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={opsLabel}>
          Área comum
          <select
            aria-label="Área comum"
            className={`${field} mt-2`}
            value={area.id}
            onChange={(e) => setAreaId(e.target.value)}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={opsLabel}>
          Data da reserva
          <input
            type="date"
            className={`${field} mt-2`}
            value={date}
            min={saoPauloDate()}
            max={saoPauloDate(90)}
            onChange={(e) => {
              if (e.target.value) onDate(e.target.value);
            }}
            required
          />
        </label>
      </div>
      <div key={area.id} className="grid gap-4 sm:grid-cols-2">
        <TimeSelect
          name="start"
          label="Horário de início"
          min={area.opens}
          max={area.closes - 15}
          initial={area.opens}
        />
        <TimeSelect
          name="end"
          label="Horário de término"
          min={area.opens + 15}
          max={area.closes}
          initial={Math.min(area.opens + 120, area.closes)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={opsLabel}>
          Finalidade
          <input
            className={`${field} mt-2`}
            name="purpose"
            minLength={3}
            maxLength={160}
            placeholder="Ex.: encontro de família"
            required
          />
        </label>
        <label className={opsLabel}>
          Número de pessoas
          <input
            className={`${field} mt-2`}
            name="guests"
            type="number"
            min={1}
            max={area.capacity}
            defaultValue={1}
            required
          />
        </label>
      </div>
      <p className="text-xs text-muted">
        Capacidade máxima: {area.capacity} pessoas. Duração de até 12 horas no mesmo dia. O horário
        fica bloqueado até a decisão ou cancelamento.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button className={btnPine} disabled={busy || !unit}>
        {busy ? "Solicitando…" : "Enviar solicitação"}
      </button>
      {!unit && (
        <p className="text-sm text-danger">Complete sua unidade em Pessoas antes de solicitar.</p>
      )}
    </form>
  );
}
function TimeSelect({
  label,
  name,
  min,
  max,
  initial,
}: {
  label: string;
  name: string;
  min: number;
  max: number;
  initial: number;
}) {
  return (
    <label className={opsLabel}>
      {label}
      <select
        aria-label={label}
        name={name}
        className={`${field} mt-2`}
        defaultValue={minuteLabel(initial)}
      >
        {Array.from({ length: Math.floor((max - min) / 15) + 1 }, (_, i) => min + i * 15).map(
          (m) => (
            <option key={m} value={minuteLabel(m)}>
              {minuteLabel(m)}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
function ReservationCard({
  reservation: r,
  manager,
  guard,
  onChanged,
}: {
  reservation: Reservation;
  manager: boolean;
  guard: boolean;
  onChanged: () => void;
}) {
  const [decision, setDecision] = useState<"aprovado" | "recusado" | "cancelado" | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const future = new Date(`${r.date}T${minuteLabel(r.start)}:00-03:00`).getTime() > Date.now();
  return (
    <article className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-bold break-words">{r.areaName}</h3>
        <StatusTag quiet={r.status === "cancelado" || r.status === "recusado"}>
          {statusLabel(r.status)}
        </StatusTag>
      </div>
      <p className="mt-3 text-sm font-semibold">
        {dayLabel(r.date)} · {minuteLabel(r.start)}–{minuteLabel(r.end)}
      </p>
      <p className="mt-1 text-xs text-muted">
        {r.residentName} · Unidade {r.unit} · {r.guests} pessoa{r.guests !== 1 ? "s" : ""}
      </p>
      <p className="mt-3 text-sm break-words">{r.purpose}</p>
      {r.reason && (
        <p className="mt-3 rounded-lg bg-paper p-3 text-xs leading-relaxed break-words">
          Motivo: {r.reason}
        </p>
      )}
      {!guard && future && (
        <div className="mt-4 flex flex-wrap gap-2">
          {manager && r.status === "pendente" && (
            <>
              <button className={btnPine} disabled={busy} onClick={() => setDecision("aprovado")}>
                Aprovar
              </button>
              <button className={btnGhost} disabled={busy} onClick={() => setDecision("recusado")}>
                Recusar
              </button>
            </>
          )}
          {(manager || r.mine) && ["pendente", "aprovado"].includes(r.status) && (
            <button className={btnGhost} disabled={busy} onClick={() => setDecision("cancelado")}>
              Cancelar reserva
            </button>
          )}
        </div>
      )}
      {decision && (
        <form
          className="mt-4 space-y-3 border-t border-line pt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await reviewReservation({
                data: {
                  id: r.id,
                  version: r.version,
                  status: decision,
                  reason: decision === "aprovado" ? "" : reason,
                },
              });
              onChanged();
            } catch (error) {
              setError(errorText(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {decision === "aprovado" ? (
            <p className="text-sm font-semibold">Confirmar aprovação deste período?</p>
          ) : (
            <label className={opsLabel}>
              Motivo {decision === "recusado" ? "da recusa" : "do cancelamento"}
              <textarea
                className={`${field} mt-2 min-h-20 py-3`}
                required
                minLength={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={btnPine} disabled={busy}>
              {busy
                ? "Salvando…"
                : decision === "aprovado"
                  ? "Confirmar aprovação"
                  : decision === "recusado"
                    ? "Confirmar recusa"
                    : "Confirmar cancelamento"}
            </button>
            <button
              type="button"
              className={btnGhost}
              disabled={busy}
              onClick={() => {
                setDecision(null);
                setError("");
              }}
            >
              Voltar
            </button>
          </div>
        </form>
      )}
    </article>
  );
}
function AreaManager({ areas, onSaved }: { areas: Area[]; onSaved: () => void }) {
  const [editing, setEditing] = useState<Area | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className={opsCard}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Áreas do condomínio</h2>
          <p className="mt-1 text-xs text-muted">
            Desativar uma área impede novos pedidos e mantém as reservas já agendadas.
          </p>
        </div>
        <button className={btnGhost} onClick={() => setEditing(null)}>
          Nova área
        </button>
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {areas.map((area) => (
          <button
            key={area.id}
            className={btnGhost}
            onClick={() => {
              setEditing(area);
              setError("");
            }}
          >
            Editar {area.name}
            {!area.active ? " · inativa" : ""}
          </button>
        ))}
      </div>
      <form
        key={editing?.id || "new"}
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const values = new FormData(form);
          setBusy(true);
          setError("");
          try {
            await saveArea({
              data: {
                id: editing?.id || "",
                name: String(values.get("name")),
                description: String(values.get("description")),
                capacity: Number(values.get("capacity")),
                opens: parseMinute(String(values.get("opens"))),
                closes: parseMinute(String(values.get("closes"))),
                active: values.get("active") === "on",
              },
            });
            form.reset();
            setEditing(null);
            onSaved();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h3 className="text-sm font-semibold">{editing ? "Editar área" : "Cadastrar nova área"}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={opsLabel}>
            Nome da área
            <input
              name="name"
              className={`${field} mt-2`}
              defaultValue={editing?.name || ""}
              minLength={3}
              maxLength={80}
              required
              placeholder="Ex.: churrasqueira"
            />
          </label>
          <label className={opsLabel}>
            Capacidade de pessoas
            <input
              name="capacity"
              type="number"
              className={`${field} mt-2`}
              defaultValue={editing?.capacity || 20}
              min={1}
              max={500}
              required
            />
          </label>
        </div>
        <label className={opsLabel}>
          Orientações de uso
          <textarea
            name="description"
            className={`${field} mt-2 min-h-20 py-3`}
            defaultValue={editing?.description || ""}
            maxLength={500}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <TimeSelect
            name="opens"
            label="Abertura"
            min={0}
            max={1425}
            initial={editing?.opens ?? 480}
          />
          <TimeSelect
            name="closes"
            label="Fechamento"
            min={15}
            max={1440}
            initial={editing?.closes ?? 1320}
          />
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            name="active"
            defaultChecked={editing?.active ?? true}
            className="size-4 accent-pine"
          />
          Disponível para novos pedidos
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button className={btnPine} disabled={busy}>
          {busy ? "Salvando…" : editing ? "Salvar área" : "Cadastrar área"}
        </button>
      </form>
    </section>
  );
}

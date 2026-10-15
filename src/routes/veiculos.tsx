import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CarFront, Check, Clock3, RefreshCw, Search, ShieldCheck, ShieldX, X } from "lucide-react";
import { AppShell, Notice, btnClay, btnGhost, field, useQuati } from "@/components/app-shell";
import {
  cancelVehicle,
  listVehicles,
  lookupVehicle,
  requestVehicle,
  reviewVehicle,
} from "@/lib/condo/vehicles";
import {
  canConsultVehicles,
  canReviewVehicles,
  normalizePlate,
  VEHICLE_STATUS,
} from "@/lib/condo/vehicle-rules";
import { errorText, formatWhen } from "@/lib/condo/format";

export const Route = createFileRoute("/veiculos")({ component: Page });
type Pack = Awaited<ReturnType<typeof listVehicles>>;
type Vehicle = Pack["vehicles"][number];
type Tab = "meu" | "analise" | "consulta";

function Page() {
  return (
    <AppShell>
      <Vehicles />
    </AppShell>
  );
}

function Vehicles() {
  const { data, error: shellError } = useQuati();
  const [pack, setPack] = useState<Pack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab | null>(null);
  const [filter, setFilter] = useState("pendente");
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    listVehicles()
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
  }, [data, tick]);
  if (!pack)
    return error || shellError ? (
      <Notice tone="bad">{error || shellError}</Notice>
    ) : (
      <div
        role="status"
        aria-label="Carregando veículos"
        className="h-40 animate-pulse rounded-3xl bg-line"
      />
    );
  const manager = canReviewVehicles(pack.me.role);
  const staff = canConsultVehicles(pack.me.role);
  const selected = tab || (manager ? "analise" : pack.me.role === "porteiro" ? "consulta" : "meu");
  const refresh = () => setTick((n) => n + 1);
  const active = pack.ownVehicles.find((v) => v.status === "pendente" || v.status === "aprovado");
  const filtered = pack.vehicles.filter((v) => filter === "todos" || v.status === filter);
  const tabs: { key: Tab; label: string }[] = [
    ...(manager ? [{ key: "analise" as const, label: "Solicitações" }] : []),
    ...(staff ? [{ key: "consulta" as const, label: "Consultar placa" }] : []),
    ...(pack.me.role !== "porteiro" ? [{ key: "meu" as const, label: "Meu veículo" }] : []),
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-widest text-pine uppercase">
            Controle de acesso
          </p>
          <h1 className="font-display text-4xl">Veículos</h1>
          <p className="mt-2 text-sm text-muted">
            Uma vaga por apartamento. Mais organização e segurança na chegada.
          </p>
        </div>
        <button type="button" className={btnGhost} onClick={refresh}>
          <RefreshCw className="size-4" aria-hidden="true" /> Atualizar
        </button>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-line bg-moss p-4 text-sm text-pine">
        <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
        <p>A entrada só é liberada após aprovação de um admin ou da síndica.</p>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <div
        aria-label="Áreas de veículos"
        className="flex flex-wrap gap-2 border-b border-line pb-3"
      >
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={selected === item.key}
            className={`${selected === item.key ? btnClay : btnGhost}`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {selected === "consulta" && staff && <PlateLookup />}
      {selected === "analise" && manager && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2>Solicitações de cadastro</h2>
              <p className="text-xs text-muted">
                Até 100 cadastros recentes, com pendentes primeiro.
              </p>
            </div>
            <label className="flex items-center gap-2 whitespace-nowrap text-sm">
              Status
              <select className={field} value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="pendente">Pendentes</option>
                <option value="aprovado">Aprovados</option>
                <option value="recusado">Recusados</option>
                <option value="cancelado">Cancelados</option>
                <option value="todos">Todos</option>
              </select>
            </label>
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              title="Nenhuma solicitação nesta lista"
              text="Os pedidos dos moradores aparecerão aqui para análise."
            />
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {filtered.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} review onDone={refresh} />
              ))}
            </div>
          )}
        </section>
      )}
      {selected === "meu" && pack.me.role !== "porteiro" && (
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <section className="space-y-4">
            <div>
              <h2>Cadastro do apartamento</h2>
              <p className="mt-1 text-sm text-muted">Unidade: {pack.me.unit || "não informada"}</p>
            </div>
            {active ? (
              <VehicleCard vehicle={active} onDone={refresh} />
            ) : pack.unitOccupied ? (
              <Notice>
                Este apartamento já tem um veículo aprovado ou uma solicitação pendente. Cada
                apartamento pode cadastrar apenas um veículo.
              </Notice>
            ) : !pack.me.unit ? (
              <Notice>
                Informe sua unidade em{" "}
                <Link to="/moradores" className="font-semibold underline">
                  Pessoas
                </Link>{" "}
                antes de solicitar o cadastro.
              </Notice>
            ) : (
              <RequestForm unit={pack.me.unit} onDone={refresh} />
            )}
            <p className="text-xs leading-relaxed text-muted">
              Pedidos pendentes também ocupam a vaga. Para trocar de veículo, cancele o cadastro
              atual e envie um novo pedido para análise. O cancelamento retira a liberação
              imediatamente.
            </p>
          </section>
          <section className="space-y-4">
            <h2>Histórico de solicitações</h2>
            {pack.ownVehicles.filter((v) => v.id !== active?.id).length === 0 ? (
              <EmptyState
                title="Seu histórico começa aqui"
                text="Acompanhe aqui os cadastros recusados e cancelados, com os motivos das decisões."
              />
            ) : (
              pack.ownVehicles
                .filter((v) => v.id !== active?.id)
                .map((vehicle) => (
                  <VehicleCard key={vehicle.id} vehicle={vehicle} onDone={refresh} />
                ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function RequestForm({ unit, onDone }: { unit: string; onDone: () => void }) {
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestVehicle({ data: { plate, model, color } });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border border-line bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-moss text-pine">
          <CarFront className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2>Solicitar cadastro</h2>
          <p className="text-xs text-muted">Para a unidade {unit}</p>
        </div>
      </div>
      <label className="block text-sm">
        Placa
        <input
          className={`${field} mt-1.5 font-semibold tracking-widest uppercase`}
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          placeholder="ABC-1234 ou ABC1D23"
          required
          maxLength={9}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-describedby="plate-help"
        />
      </label>
      <p id="plate-help" className="text-xs text-muted">
        Aceitamos o padrão antigo e o Mercosul.
      </p>
      <label className="block text-sm">
        Marca e modelo
        <input
          className={`${field} mt-1.5`}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Ex.: Honda Civic"
          required
          minLength={2}
          maxLength={80}
        />
      </label>
      <label className="block text-sm">
        Cor
        <input
          className={`${field} mt-1.5`}
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="Ex.: Prata"
          required
          minLength={2}
          maxLength={30}
        />
      </label>
      {error && <Notice tone="bad">{error}</Notice>}
      <button type="submit" className={`${btnClay} w-full`} disabled={busy}>
        <CarFront className="size-4" aria-hidden="true" />
        {busy ? "Enviando…" : "Enviar solicitação"}
      </button>
      <p className="text-xs text-muted">O veículo ficará bloqueado na portaria até a aprovação.</p>
    </form>
  );
}

function VehicleCard({
  vehicle: v,
  review = false,
  onDone,
}: {
  vehicle: Vehicle;
  review?: boolean;
  onDone: () => void;
}) {
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isActive = v.status === "pendente" || v.status === "aprovado";
  async function action(decision: "aprovado" | "recusado" | "cancelado") {
    setBusy(true);
    setError(null);
    try {
      if (decision === "cancelado") await cancelVehicle({ data: { id: v.id } });
      else await reviewVehicle({ data: { id: v.id, decision, reason } });
      setReject(false);
      setConfirmCancel(false);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="space-y-4 rounded-3xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Placa do veículo</p>
          <p className="mt-1 font-mono text-2xl font-bold tracking-widest">{v.plate}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${v.status === "recusado" ? "bg-danger-soft text-danger" : v.status === "aprovado" ? "bg-moss text-pine" : "bg-paper text-muted"}`}
        >
          {v.status === "pendente" ? (
            <Clock3 className="size-3.5" aria-hidden="true" />
          ) : v.status === "aprovado" ? (
            <Check className="size-3.5" aria-hidden="true" />
          ) : (
            <X className="size-3.5" aria-hidden="true" />
          )}
          {VEHICLE_STATUS[v.status]}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
        <div>
          <dt className="text-xs text-muted">Veículo</dt>
          <dd className="mt-0.5 font-semibold">{v.model}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Cor</dt>
          <dd className="mt-0.5">{v.color}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Morador</dt>
          <dd className="mt-0.5">{v.residentName}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Unidade</dt>
          <dd className="mt-0.5">{v.unit}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted">Solicitado em {formatWhen(v.createdAt)}</p>
      {v.reviewedAt && (
        <p className="text-xs text-muted">
          Analisado por {v.reviewerName || "administração"} · {formatWhen(v.reviewedAt)}
        </p>
      )}
      {v.status === "recusado" && <Notice tone="bad">Motivo da recusa: {v.rejectionReason}</Notice>}
      {v.status === "cancelado" && v.cancellationReason && <Notice>{v.cancellationReason}</Notice>}
      {error && <Notice tone="bad">{error}</Notice>}
      {review && v.status === "pendente" && (
        <div className="border-t border-line pt-4">
          {reject ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void action("recusado");
              }}
            >
              <label className="block text-sm">
                Motivo da recusa
                <textarea
                  className={`${field} mt-1.5 min-h-24 py-3`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={3}
                  maxLength={300}
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
                onClick={() => void action("aprovado")}
              >
                <Check className="size-4" aria-hidden="true" />
                {busy ? "Salvando…" : "Aprovar veículo"}
              </button>
              <button
                type="button"
                className={`${btnGhost} text-danger`}
                disabled={busy}
                onClick={() => setReject(true)}
              >
                <X className="size-4" aria-hidden="true" /> Recusar
              </button>
            </div>
          )}
        </div>
      )}
      {v.mine && isActive && !review && (
        <div className="border-t border-line pt-4">
          {confirmCancel ? (
            <div className="space-y-3">
              <p className="text-sm text-danger">
                Cancelar este cadastro? A placa perderá a liberação e a vaga ficará disponível para
                um novo pedido.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${btnGhost} text-danger`}
                  disabled={busy}
                  onClick={() => void action("cancelado")}
                >
                  {busy ? "Cancelando…" : "Confirmar cancelamento"}
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={busy}
                  onClick={() => setConfirmCancel(false)}
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={btnGhost} onClick={() => setConfirmCancel(true)}>
              Cancelar cadastro
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function PlateLookup() {
  const [plate, setPlate] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof lookupVehicle>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setExpired(true), 30000);
    return () => clearTimeout(timer);
  }, [result]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const next = await lookupVehicle({ data: { plate } });
      setResult(next);
      setExpired(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="max-w-3xl space-y-5">
      <form onSubmit={submit} className="space-y-4 rounded-3xl border border-line bg-card p-5">
        <div>
          <h2>Consultar acesso pela placa</h2>
          <p className="mt-1 text-sm text-muted">
            Confira a autorização a cada chegada do veículo.
          </p>
        </div>
        <label className="block text-sm">
          Placa para consulta
          <input
            disabled={busy}
            className={`${field} mt-1.5 font-mono text-lg font-semibold tracking-widest uppercase`}
            placeholder="ABC-1234 ou ABC1D23"
            value={plate}
            onChange={(e) => {
              setPlate(e.target.value.toUpperCase());
              setResult(null);
              setError(null);
            }}
            maxLength={9}
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
        <button type="submit" className={btnClay} disabled={busy}>
          <Search className="size-4" aria-hidden="true" />
          {busy ? "Consultando…" : "Consultar placa"}
        </button>
      </form>
      {error && <Notice tone="bad">{error}</Notice>}
      {result && (
        <div
          role="status"
          aria-live="polite"
          className={`space-y-4 rounded-3xl border p-5 ${expired ? "border-line bg-card text-ink" : result.allowed ? "border-pine/20 bg-moss text-pine" : "border-danger/20 bg-danger-soft text-danger"}`}
        >
          <div className="flex items-center gap-3">
            {expired ? (
              <Clock3 className="size-8 shrink-0" aria-hidden="true" />
            ) : result.allowed ? (
              <ShieldCheck className="size-8 shrink-0" aria-hidden="true" />
            ) : (
              <ShieldX className="size-8 shrink-0" aria-hidden="true" />
            )}
            <div>
              <p className="text-xs font-semibold tracking-widest">{normalizePlate(plate)}</p>
              <h2>
                {expired ? "Consulta expirada" : result.allowed ? "Liberado" : "Não liberado"}
              </h2>
            </div>
          </div>
          <p className="text-sm">
            {expired
              ? "Consulte a placa novamente para verificar a autorização atual."
              : result.reason}
          </p>
          {result.vehicle && !expired && (
            <dl className="grid grid-cols-2 gap-3 border-t border-current/15 pt-4 text-sm">
              <div>
                <dt className="text-xs">Veículo</dt>
                <dd className="font-semibold">
                  {result.vehicle.model} · {result.vehicle.color}
                </dd>
              </div>
              <div>
                <dt className="text-xs">Unidade</dt>
                <dd className="font-semibold">{result.vehicle.unit}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs">Morador</dt>
                <dd className="font-semibold">{result.vehicle.residentName}</dd>
              </div>
            </dl>
          )}
          <p className="text-xs">
            A consulta expira em 30 segundos. Verifique novamente a cada chegada.
          </p>
        </div>
      )}
      {!result && !error && (
        <EmptyState
          title="Confira antes de liberar"
          text="Digite a placa para verificar o cadastro e a aprovação da administração."
        />
      )}
    </section>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-line bg-card px-6 py-10 text-center">
      <CarFront className="mx-auto mb-3 size-7 text-pine" aria-hidden="true" />
      <h3 className="font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{text}</p>
    </div>
  );
}

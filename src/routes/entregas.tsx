import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Notice, btnClay, btnGhost, btnPine, field, useQuati } from "@/components/app-shell";
import { createDelivery, listDeliveries, prepareDeliveryWhatsapp } from "@/lib/condo/api";
import { compressImage } from "@/lib/condo/image";
import { CARRIERS, canRegisterDelivery } from "@/lib/condo/roles";
import { errorText, formatWhen } from "@/lib/condo/format";

export const Route = createFileRoute("/entregas")({ component: Page });

const statusLabel: Record<string, string> = {
  recebida: "Na portaria",
  notificada: "Avisada",
  assinada: "Assinada",
  retirada: "Retirada",
};

type List = Awaited<ReturnType<typeof listDeliveries>>;

function Page() {
  return (
    <AppShell>
      <Entregas />
    </AppShell>
  );
}

function Entregas() {
  const { data } = useQuati();
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const role = data?.profile.role;

  useEffect(() => {
    if (!role) return;
    let cancel = false;
    listDeliveries()
      .then((next) => {
        if (!cancel) setList(next);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(errorText(err));
      });
    return () => {
      cancel = true;
    };
  }, [role, tick]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl">Entregas</h1>
        <p className="mt-1 text-sm text-muted">
          A portaria registra. O morador assina no celular pelo link do WhatsApp.
        </p>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {list && canRegisterDelivery(list.me.role) && (
        <Register residents={list.residents} onDone={() => setTick((n) => n + 1)} />
      )}
      {!list ? (
        <div className="h-40 animate-pulse rounded-3xl bg-line" />
      ) : list.deliveries.length === 0 ? (
        <p className="rounded-3xl border border-line bg-card p-5 text-sm text-muted">Nenhuma encomenda ainda.</p>
      ) : (
        <ul className="space-y-3">
          {list.deliveries.map((item) => (
            <li key={item.id} className="rounded-3xl border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">{item.unit}</p>
                  <h2 className="font-display text-2xl">{item.recipientName}</h2>
                  <p className="text-sm text-muted">
                    {item.carrier}
                    {item.trackingCode ? ` · ${item.trackingCode}` : ""} · {formatWhen(item.receivedAt)}
                  </p>
                  <p className="mt-1 text-sm">{item.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-moss px-3 py-1 text-xs font-semibold text-pine">
                  {statusLabel[item.status] ?? item.status}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/entregas/$id" params={{ id: item.id }} className={btnGhost}>
                  {item.mine && item.status !== "assinada" && item.status !== "retirada" ? "Assinar" : "Abrir"}
                </Link>
                {canRegisterDelivery(list.me.role) && item.status !== "retirada" && (
                  <WhatsappButton id={item.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Register({
  residents,
  onDone,
}: {
  residents: List["residents"];
  onDone: () => void;
}) {
  const [residentUserId, setResidentUserId] = useState(residents[0]?.userId ?? "");
  const [carrier, setCarrier] = useState<string>(CARRIERS[0]);
  const [trackingCode, setTrackingCode] = useState("");
  const [description, setDescription] = useState("");
  const [photoData, setPhotoData] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ whatsappUrl: string | null; whatsappBody: string; recipientName: string } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await createDelivery({
        data: {
          residentUserId,
          carrier,
          trackingCode,
          description,
          photoData,
          origin: window.location.origin,
        },
      });
      setSent(result);
      setDescription("");
      setTrackingCode("");
      setPhotoData(undefined);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-3xl border border-line bg-card p-5">
      <h2 className="font-display text-2xl">Registrar encomenda</h2>
      {residents.length === 0 ? (
        <p className="text-sm text-muted">
          Nenhum morador com unidade cadastrada. Peça para entrar e completar o cadastro em Pessoas.
        </p>
      ) : (
        <>
          <label className="block text-sm">
            Morador
            <select className={`${field} mt-1`} value={residentUserId} onChange={(e) => setResidentUserId(e.target.value)}>
              {residents.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.unit} — {person.fullName}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Transportadora
              <select className={`${field} mt-1`} value={carrier} onChange={(e) => setCarrier(e.target.value)}>
                {CARRIERS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Rastreio
              <input className={`${field} mt-1`} value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm">
            Descrição
            <input className={`${field} mt-1`} value={description} onChange={(e) => setDescription(e.target.value)} required />
          </label>
          <label className="block text-sm">
            Foto da encomenda
            <input
              className="mt-1 block w-full text-sm"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void compressImage(file).then(setPhotoData).catch((err: unknown) => setError(errorText(err)));
              }}
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button className={btnClay} disabled={busy} type="submit">
            {busy ? "Registrando…" : "Registrar e preparar WhatsApp"}
          </button>
        </>
      )}
      {sent && <WhatsappCard {...sent} />}
    </form>
  );
}

function WhatsappButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className={btnGhost}
        onClick={() => {
          void prepareDeliveryWhatsapp({ data: { id, origin: window.location.origin } })
            .then((result) => {
              if (!result.whatsappUrl) {
                setError("Morador sem telefone com DDD.");
                return;
              }
              window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
            })
            .catch((err: unknown) => setError(errorText(err)));
        }}
      >
        WhatsApp
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function WhatsappCard({
  whatsappUrl,
  whatsappBody,
  recipientName,
}: {
  whatsappUrl: string | null;
  whatsappBody: string;
  recipientName: string;
}) {
  return (
    <div className="rounded-2xl bg-moss p-4">
      <p className="text-sm font-semibold text-pine">Mensagem pronta para {recipientName}</p>
      <p className="mt-2 text-sm whitespace-pre-wrap text-ink">{whatsappBody}</p>
      {whatsappUrl ? (
        <a className={`${btnPine} mt-3`} href={whatsappUrl} target="_blank" rel="noreferrer">
          Abrir no WhatsApp
        </a>
      ) : (
        <p className="mt-2 text-sm text-danger">Cadastre o telefone com DDD para abrir o WhatsApp.</p>
      )}
    </div>
  );
}

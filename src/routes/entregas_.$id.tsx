import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Notice, btnClay, btnGhost, field, useQuati } from "@/components/app-shell";
import { SignaturePad } from "@/components/signature-pad";
import {
  cancelDelivery,
  getDelivery,
  markPickedUp,
  prepareDeliveryWhatsapp,
  signDelivery,
} from "@/lib/condo/api";
import { canRegisterDelivery } from "@/lib/condo/roles";
import { errorText, formatWhen } from "@/lib/condo/format";

export const Route = createFileRoute("/entregas_/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  return (
    <AppShell>
      <Detail id={id} />
    </AppShell>
  );
}

function Detail({ id }: { id: string }) {
  const { data: shell } = useQuati();
  const [pack, setPack] = useState<Awaited<ReturnType<typeof getDelivery>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!shell) return;
    let cancel = false;
    getDelivery({ data: { id } })
      .then((next) => {
        if (cancel) return;
        setPack(next);
        setName(next.delivery.recipientName);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(errorText(err));
      });
    return () => {
      cancel = true;
    };
  }, [id, shell, tick]);

  if (error && !pack) return <Notice tone="bad">{error}</Notice>;
  if (!pack) return <div className="h-40 animate-pulse rounded-3xl bg-line" />;
  const item = pack.delivery;
  const staff = canRegisterDelivery(pack.me.role);

  async function sign(event: React.FormEvent) {
    event.preventDefault();
    if (!signature) {
      setError("Assine no quadro antes de confirmar.");
      return;
    }
    setBusy(true);
    try {
      await signDelivery({ data: { id, signatureData: signature, signerName: name } });
      setTick((n) => n + 1);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/entregas" className="text-sm text-muted">
        ← Entregas
      </Link>
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">{item.unit}</p>
        <h1 className="font-display text-4xl">{item.recipientName}</h1>
        <p className="mt-1 text-sm text-muted">
          {item.carrier} {item.trackingCode} · {formatWhen(item.receivedAt)}
        </p>
        <p className="mt-3">{item.description}</p>
      </div>
      {item.photoData && (
        <img
          src={item.photoData}
          alt="Foto da encomenda"
          className="max-h-72 rounded-3xl border border-line"
        />
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      {item.signatureData ? (
        <section
          aria-label="Comprovante de assinatura"
          className="rounded-3xl border border-line bg-card p-5"
        >
          <h2 className="font-display text-2xl">Assinatura do morador</h2>
          <p className="mt-2 text-sm font-semibold">Assinado por {item.signerName}</p>
          <p className="text-xs text-muted">{formatWhen(item.signedAt)}</p>
          <img
            src={item.signatureData}
            alt={`Assinatura de ${item.signerName}`}
            className="mt-4 h-56 w-full rounded-xl border border-line bg-signature-paper object-contain"
          />
          <a
            href={item.signatureData}
            download={`assinatura-${item.id}.png`}
            className={`${btnGhost} mt-4`}
          >
            Baixar assinatura
          </a>
        </section>
      ) : item.mine ? (
        <form onSubmit={sign} className="space-y-3 rounded-3xl border border-line bg-card p-4">
          <h2 className="font-display text-2xl">Assinar retirada</h2>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
          <SignaturePad onChange={setSignature} />
          <button className={btnClay} disabled={busy} type="submit">
            {busy ? "Enviando…" : "Confirmar assinatura"}
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted">Aguardando a assinatura do morador no celular.</p>
      )}
      {staff && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              void prepareDeliveryWhatsapp({ data: { id, origin: window.location.origin } }).then(
                (result) => {
                  if (result.whatsappUrl)
                    window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
                  else setError("Morador sem telefone com DDD.");
                },
              );
            }}
          >
            Abrir WhatsApp
          </button>
          {item.signedAt && item.status !== "retirada" && (
            <button
              type="button"
              className={btnClay}
              onClick={() => {
                void markPickedUp({ data: { id } })
                  .then(() => setTick((n) => n + 1))
                  .catch((err: unknown) => setError(errorText(err)));
              }}
            >
              Marcar retirada
            </button>
          )}
          {(item.status === "recebida" || item.status === "notificada") && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => {
                void cancelDelivery({ data: { id } })
                  .then(() => {
                    window.location.href = "/entregas";
                  })
                  .catch((err: unknown) => setError(errorText(err)));
              }}
            >
              Cancelar registro
            </button>
          )}
        </div>
      )}
    </div>
  );
}

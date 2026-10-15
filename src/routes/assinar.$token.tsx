import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SignaturePad } from "@/components/signature-pad";
import { getDeliveryByToken, signDeliveryByToken } from "@/lib/condo/api";
import { errorText, formatWhen } from "@/lib/condo/format";

export const Route = createFileRoute("/assinar/$token")({ component: SignPage });

function SignPage() {
  const { token } = Route.useParams();
  const [pack, setPack] = useState<Awaited<ReturnType<typeof getDeliveryByToken>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancel = false;
    getDeliveryByToken({ data: { token } })
      .then((next) => {
        if (cancel) return;
        setPack(next);
        setName(next.recipientName);
        setDone(Boolean(next.signedAt));
      })
      .catch((err: unknown) => {
        if (!cancel) setError(errorText(err));
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!signature) {
      setError("Assine no quadro antes de confirmar.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signDeliveryByToken({ data: { token, signatureData: signature, signerName: name } });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink">
      <div className="mx-auto max-w-md">
        <Link to="/" className="font-display text-2xl text-pine">Quati</Link>
        <p className="mt-8 text-xs font-semibold tracking-wide text-muted uppercase">Assinatura da encomenda</p>
        {!pack && !error && <div className="mt-4 h-40 animate-pulse rounded-3xl bg-line" />}
        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        {pack && (
          <>
            <h1 className="mt-2 font-display text-4xl">{pack.recipientName}</h1>
            <p className="mt-2 text-sm text-muted">
              Unidade {pack.unit} · {pack.carrier} {pack.trackingCode}
            </p>
            <p className="mt-2">{pack.description}</p>
            <p className="mt-1 text-xs text-muted">Recebida {formatWhen(pack.receivedAt)}</p>
            {done ? (
              <p className="mt-8 rounded-3xl bg-moss p-5 text-pine">Assinatura registrada. Pode retirar na portaria.</p>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-3">
                <label className="block text-sm">
                  Nome de quem assina
                  <input className="mt-1 w-full min-h-11 rounded-xl border border-line bg-card px-3" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <SignaturePad onChange={setSignature} />
                <button type="submit" disabled={busy} className="min-h-12 w-full rounded-full bg-clay font-semibold text-paper disabled:opacity-50">
                  {busy ? "Enviando…" : "Confirmar assinatura"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}

import { ThemeSelector } from "@/components/theme-selector";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getPollByToken, voteByToken } from "@/lib/condo/api";
import { errorText } from "@/lib/condo/format";

export const Route = createFileRoute("/votar/$token")({ component: VotePage });

function VotePage() {
  const { token } = Route.useParams();
  const [pack, setPack] = useState<Awaited<ReturnType<typeof getPollByToken>> | null>(null);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    getPollByToken({ data: { token } })
      .then((next) => {
        if (!cancel) setPack(next);
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
    setBusy(true);
    setError(null);
    try {
      await voteByToken({ data: { token, optionId: choice } });
      const next = await getPollByToken({ data: { token } });
      setPack(next);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const total = pack?.options.reduce((sum, option) => sum + option.votes, 0) ?? 0;

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex justify-end">
          <ThemeSelector compact />
        </div>
        <Link to="/" className="font-display text-2xl text-pine">
          Quati
        </Link>
        <p className="mt-8 text-xs font-semibold tracking-wide text-muted uppercase">
          Enquete do condomínio
        </p>
        {!pack && !error && <div className="mt-4 h-40 animate-pulse rounded-3xl bg-line" />}
        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        {pack && (
          <>
            <h1 className="mt-2 font-display text-4xl">{pack.title}</h1>
            {pack.description && <p className="mt-2 text-muted">{pack.description}</p>}
            <p className="mt-2 text-sm text-muted">
              Unidade {pack.unit} · {pack.name}
            </p>
            {pack.voted || pack.status !== "aberta" ? (
              <ul className="mt-6 space-y-3">
                {pack.options.map((option) => {
                  const width = total === 0 ? 0 : Math.round((option.votes / total) * 100);
                  return (
                    <li key={option.id}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span
                          className={pack.myOptionId === option.id ? "font-semibold text-pine" : ""}
                        >
                          {option.label}
                        </span>
                        <span className="tabular-nums text-muted">
                          {option.votes} · {width}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-line">
                        <div className="h-full bg-pine" style={{ width: `${width}%` }} />
                      </div>
                    </li>
                  );
                })}
                <p className="text-sm text-pine">
                  {pack.voted ? "Voto registrado." : "Enquete encerrada."}
                </p>
              </ul>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-2">
                {pack.options.map((option) => (
                  <label
                    key={option.id}
                    className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-card px-4"
                  >
                    <input
                      type="radio"
                      name="option"
                      value={option.id}
                      checked={choice === option.id}
                      onChange={() => setChoice(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
                <button
                  type="submit"
                  disabled={busy || !choice}
                  className="min-h-12 w-full rounded-full bg-clay font-semibold text-on-accent disabled:opacity-50"
                >
                  {busy ? "Enviando…" : "Confirmar voto"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}

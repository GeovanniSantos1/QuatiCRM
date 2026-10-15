import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Notice, btnClay, btnGhost, useQuati } from "@/components/app-shell";
import { closePoll, getPoll, voteInApp } from "@/lib/condo/api";
import { canManagePolls } from "@/lib/condo/roles";
import { errorText, formatWhen } from "@/lib/condo/format";

export const Route = createFileRoute("/enquetes/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  return (
    <AppShell>
      <Poll id={id} />
    </AppShell>
  );
}

function Poll({ id }: { id: string }) {
  const { data: shell } = useQuati();
  const [pack, setPack] = useState<Awaited<ReturnType<typeof getPoll>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!shell) return;
    let cancel = false;
    getPoll({ data: { id, origin: window.location.origin } })
      .then((next) => {
        if (!cancel) setPack(next);
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

  const total = pack.options.reduce((sum, option) => sum + option.votes, 0);
  const showCount = pack.poll.status !== "aberta" || Boolean(pack.myOptionId);

  async function vote(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await voteInApp({ data: { pollId: id, optionId: choice } });
      setTick((n) => n + 1);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/enquetes" className="text-sm text-muted">
        ← Enquetes
      </Link>
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          {pack.poll.status === "aberta" ? "Aberta" : "Encerrada"}
          {pack.poll.closesAt ? ` · até ${formatWhen(pack.poll.closesAt)}` : ""}
        </p>
        <h1 className="font-display text-4xl">{pack.poll.title}</h1>
        {pack.poll.description && <p className="mt-2 text-muted">{pack.poll.description}</p>}
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {pack.canVote ? (
        <form onSubmit={vote} className="space-y-2">
          {pack.options.map((option) => (
            <label key={option.id} className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-card px-4">
              <input type="radio" name="option" value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} />
              <span>{option.label}</span>
            </label>
          ))}
          <button className={btnClay} disabled={busy || !choice} type="submit">
            {busy ? "Registrando…" : "Confirmar voto"}
          </button>
        </form>
      ) : (
        <ul className="space-y-3">
          {pack.options.map((option) => {
            const width = total === 0 ? 0 : Math.round((option.votes / total) * 100);
            const mine = pack.myOptionId === option.id;
            return (
              <li key={option.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className={mine ? "font-semibold text-pine" : ""}>{option.label}</span>
                  {showCount && (
                    <span className="tabular-nums text-muted">
                      {option.votes} · {width}%
                    </span>
                  )}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div className="h-full bg-pine" style={{ width: `${showCount ? width : 0}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pack.unitAlreadyVoted && <p className="text-sm text-muted">Sua unidade já votou.</p>}
      {canManagePolls(pack.me.role) && pack.poll.status === "aberta" && (
        <button
          type="button"
          className={btnGhost}
          onClick={() => {
            void closePoll({ data: { id } })
              .then(() => setTick((n) => n + 1))
              .catch((err: unknown) => setError(errorText(err)));
          }}
        >
          Encerrar enquete
        </button>
      )}
      {pack.ballots.length > 0 && (
        <section className="rounded-3xl border border-line bg-card p-4">
          <h2 className="font-display text-2xl">WhatsApp dos moradores</h2>
          <ul className="mt-3 space-y-2">
            {pack.ballots.map((row) => (
              <li key={row.unit + row.name} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {row.unit} · {row.name}
                  {row.voted ? " · votou" : ""}
                </span>
                {row.whatsappUrl ? (
                  <a className="font-semibold text-pine" href={row.whatsappUrl} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                ) : (
                  <span className="text-danger">Sem telefone</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

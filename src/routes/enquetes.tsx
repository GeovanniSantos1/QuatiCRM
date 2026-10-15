import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, Notice, btnClay, field, useQuati } from "@/components/app-shell";
import { createPoll, listPolls } from "@/lib/condo/api";
import { canManagePolls } from "@/lib/condo/roles";
import { errorText } from "@/lib/condo/format";

export const Route = createFileRoute("/enquetes")({ component: Page });

type List = Awaited<ReturnType<typeof listPolls>>;

function Page() {
  return (
    <AppShell>
      <Enquetes />
    </AppShell>
  );
}

function Enquetes() {
  const { data } = useQuati();
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!data) return;
    let cancel = false;
    listPolls()
      .then((next) => {
        if (!cancel) setList(next);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(errorText(err));
      });
    return () => {
      cancel = true;
    };
  }, [data, tick]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl">Enquetes</h1>
        <p className="mt-1 text-sm text-muted">Cada unidade vota uma vez. O link chega no WhatsApp do morador.</p>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {list && canManagePolls(list.me.role) && <Composer onDone={() => setTick((n) => n + 1)} />}
      {!list ? (
        <div className="h-40 animate-pulse rounded-3xl bg-line" />
      ) : list.polls.length === 0 ? (
        <p className="rounded-3xl border border-line bg-card p-5 text-sm text-muted">Nenhuma enquete aberta.</p>
      ) : (
        <ul className="space-y-3">
          {list.polls.map((poll) => (
            <li key={poll.id}>
              <Link to="/enquetes/$id" params={{ id: poll.id }} className="block rounded-3xl border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-2xl">{poll.title}</h2>
                  <span className="rounded-full bg-moss px-3 py-1 text-xs font-semibold text-pine">
                    {poll.status === "aberta" ? "Aberta" : "Encerrada"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">
                  {poll.votes} voto{poll.votes === 1 ? "" : "s"} · {poll.units} unidade{poll.units === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Composer({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["Sim", "Não"]);
  const [closesOn, setClosesOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<Awaited<ReturnType<typeof createPoll>>["ballots"]>([]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await createPoll({
        data: { title, description, options, closesOn, origin: window.location.origin },
      });
      setLinks(result.ballots);
      setTitle("");
      setDescription("");
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-3xl border border-line bg-card p-5">
      <h2 className="font-display text-2xl">Nova enquete</h2>
      <input className={field} placeholder="Pergunta" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <textarea className={`${field} min-h-24 py-3`} placeholder="Contexto para os moradores" value={description} onChange={(e) => setDescription(e.target.value)} />
      {options.map((option, index) => (
        <input
          key={index}
          className={field}
          value={option}
          placeholder={`Opção ${index + 1}`}
          onChange={(event) => setOptions(options.map((item, i) => (i === index ? event.target.value : item)))}
        />
      ))}
      <button type="button" className="min-h-11 text-sm font-semibold text-pine" onClick={() => setOptions([...options, ""])}>
        Adicionar opção
      </button>
      <label className="block text-sm">
        Encerra em
        <input className={`${field} mt-1`} type="date" value={closesOn} onChange={(e) => setClosesOn(e.target.value)} />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className={btnClay} disabled={busy} type="submit">{busy ? "Abrindo…" : "Abrir enquete e gerar WhatsApp"}</button>
      {links.length > 0 && (
        <ul className="space-y-2">
          {links.map((row) => (
            <li key={row.unit + row.name} className="flex items-center justify-between gap-3 rounded-2xl bg-moss px-3 py-2 text-sm">
              <span>{row.unit} · {row.name}</span>
              {row.whatsappUrl ? (
                <a className="font-semibold text-pine" href={row.whatsappUrl} target="_blank" rel="noreferrer">WhatsApp</a>
              ) : (
                <span className="text-danger">Sem telefone</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

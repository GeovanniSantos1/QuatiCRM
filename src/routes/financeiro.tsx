import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Notice, btnClay, btnGhost, field, useQuati } from "@/components/app-shell";
import { createExpense, deleteExpense, getFinance, getReceipt, updateBudget } from "@/lib/condo/api";
import { compressImage } from "@/lib/condo/image";
import { EXPENSE_CATEGORIES, canPostExpense } from "@/lib/condo/roles";
import { errorText, formatBrl, formatDay, parseBrlToCents } from "@/lib/condo/format";

export const Route = createFileRoute("/financeiro")({ component: Page });

type Finance = Awaited<ReturnType<typeof getFinance>>;

function Page() {
  return (
    <AppShell>
      <Financeiro />
    </AppShell>
  );
}

function Financeiro() {
  const { data } = useQuati();
  const [pack, setPack] = useState<Finance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!data) return;
    let cancel = false;
    getFinance()
      .then((next) => {
        if (!cancel) setPack(next);
      })
      .catch((err: unknown) => {
        if (!cancel) setError(errorText(err));
      });
    return () => {
      cancel = true;
    };
  }, [data, tick]);

  if (!pack) {
    return error ? <Notice tone="bad">{error}</Notice> : <div className="h-40 animate-pulse rounded-3xl bg-line" />;
  }

  const ratio = pack.budgetCents > 0 ? Math.min(100, Math.round((pack.spentCents / pack.budgetCents) * 100)) : 0;
  const health =
    pack.budgetCents <= 0 ? "Sem orçamento" : ratio < 75 ? "Saudável" : ratio < 100 ? "Atenção" : "Acima do orçamento";
  const max = pack.categories[0]?.cents ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl">Caixa</h1>
        <p className="mt-1 text-sm text-muted">Gastos do mês, fundo de reserva e comprovantes.</p>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <section className="grid gap-3 sm:grid-cols-3">
        <Card label="Gasto no mês" value={formatBrl(pack.spentCents)} hint={health} />
        <Card label="Orçamento" value={formatBrl(pack.budgetCents)} hint={pack.budgetCents ? `${ratio}% usado` : "Ainda não definido"} />
        <Card label="Reserva" value={formatBrl(pack.reserveCents)} hint={`Mês anterior ${formatBrl(pack.previousSpentCents)}`} />
      </section>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className={`h-full ${ratio >= 100 ? "bg-clay" : "bg-pine"}`} style={{ width: `${ratio}%` }} />
      </div>
      {pack.categories.length > 0 && (
        <section className="rounded-3xl border border-line bg-card p-5">
          <h2 className="font-display text-2xl">Por categoria</h2>
          <ul className="mt-4 space-y-3">
            {pack.categories.map((row) => (
              <li key={row.category}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{row.category}</span>
                  <span className="tabular-nums">{formatBrl(row.cents)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div className="h-full bg-pine" style={{ width: `${Math.round((row.cents / max) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {canPostExpense(pack.me.role) && <BudgetForm pack={pack} onDone={() => setTick((n) => n + 1)} />}
      {canPostExpense(pack.me.role) && <ExpenseForm onDone={() => setTick((n) => n + 1)} />}
      <section className="space-y-3">
        <h2 className="font-display text-2xl">Lançamentos</h2>
        {pack.expenses.length === 0 && <p className="text-sm text-muted">Nenhum gasto lançado.</p>}
        {pack.expenses.map((item) => (
          <article key={item.id} className="rounded-3xl border border-line bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">{item.category}</p>
                <h3 className="font-display text-2xl">{item.title}</h3>
                <p className="text-sm text-muted">
                  {formatDay(item.spentOn)}
                  {item.vendor ? ` · ${item.vendor}` : ""}
                </p>
                {item.notes && <p className="mt-1 text-sm">{item.notes}</p>}
              </div>
              <p className="font-semibold tabular-nums">{formatBrl(item.amountCents)}</p>
            </div>
            <div className="mt-3 flex gap-2">
              {item.hasReceipt && <ReceiptButton id={item.id} />}
              {canPostExpense(pack.me.role) && (
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => {
                    void deleteExpense({ data: { id: item.id } })
                      .then(() => setTick((n) => n + 1))
                      .catch((err: unknown) => setError(errorText(err)));
                  }}
                >
                  Excluir
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-3xl border border-line bg-card p-4">
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-pine">{hint}</p>
    </div>
  );
}

function BudgetForm({ pack, onDone }: { pack: Finance; onDone: () => void }) {
  const [budget, setBudget] = useState((pack.budgetCents / 100).toFixed(2).replace(".", ","));
  const [reserve, setReserve] = useState((pack.reserveCents / 100).toFixed(2).replace(".", ","));
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 rounded-3xl border border-line bg-card p-5 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const monthlyBudgetCents = parseBrlToCents(budget) ?? (budget.trim() === "0" || budget.trim() === "0,00" ? 0 : null);
        const reserveCents = parseBrlToCents(reserve) ?? (reserve.trim() === "0" || reserve.trim() === "0,00" ? 0 : null);
        if (monthlyBudgetCents == null || reserveCents == null) {
          setError("Informe valores válidos. Zero é permitido.");
          return;
        }
        void updateBudget({ data: { monthlyBudgetCents, reserveCents } })
          .then(() => {
            setError(null);
            onDone();
          })
          .catch((err: unknown) => setError(errorText(err)));
      }}
    >
      <h2 className="font-display text-2xl sm:col-span-2">Orçamento mensal</h2>
      <label className="text-sm">
        Teto do mês
        <input className={`${field} mt-1`} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </label>
      <label className="text-sm">
        Fundo de reserva
        <input className={`${field} mt-1`} value={reserve} onChange={(e) => setReserve(e.target.value)} />
      </label>
      {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
      <button className={`${btnClay} sm:col-span-2`} type="submit">
        Salvar orçamento
      </button>
    </form>
  );
}

function ExpenseForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(() => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptData, setReceiptData] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 rounded-3xl border border-line bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const amountCents = parseBrlToCents(amount);
        if (!amountCents) {
          setError("Informe o valor do gasto.");
          return;
        }
        setBusy(true);
        void createExpense({
          data: { title, category, amountCents, spentOn, vendor, notes, receiptData },
        })
          .then(() => {
            setTitle("");
            setAmount("");
            setVendor("");
            setNotes("");
            setReceiptData(undefined);
            setError(null);
            onDone();
          })
          .catch((err: unknown) => setError(errorText(err)))
          .finally(() => setBusy(false));
      }}
    >
      <h2 className="font-display text-2xl">Lançar gasto</h2>
      <input className={field} placeholder="O que foi pago" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <div className="grid gap-3 sm:grid-cols-2">
        <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
          {EXPENSE_CATEGORIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <input className={field} placeholder="Valor, ex. 1.250,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={field} type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        <input className={field} placeholder="Fornecedor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
      </div>
      <textarea className={`${field} min-h-20 py-3`} placeholder="Observação" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <label className="block text-sm">
        Comprovante
        <input
          className="mt-1 block w-full text-sm"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void compressImage(file, 1600, 0.7)
              .then(setReceiptData)
              .catch((err: unknown) => setError(errorText(err)));
          }}
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className={btnClay} disabled={busy} type="submit">
        {busy ? "Salvando…" : "Publicar gasto"}
      </button>
    </form>
  );
}

function ReceiptButton({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        className={btnGhost}
        onClick={() => {
          if (src) {
            setSrc(null);
            return;
          }
          void getReceipt({ data: { id } })
            .then((result) => setSrc(result.receiptData))
            .catch((err: unknown) => setError(errorText(err)));
        }}
      >
        {src ? "Ocultar comprovante" : "Ver comprovante"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {src && <img src={src} alt="Comprovante" className="mt-3 max-h-80 rounded-2xl border border-line" />}
    </div>
  );
}

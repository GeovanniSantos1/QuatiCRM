import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Notice, btnClay, field, useQuati } from "@/components/app-shell";
import { listPeople, updateMyProfile, updatePerson } from "@/lib/condo/api";
import { ROLE_HINT, ROLE_LABEL, ROLES, canAssignRoles, type Role } from "@/lib/condo/roles";
import { errorText } from "@/lib/condo/format";
import { ResidentAdministration } from "@/components/resident-administration";
import { canManageResidents } from "@/lib/condo/membership-rules";

export const Route = createFileRoute("/moradores")({ component: Page });

type People = Awaited<ReturnType<typeof listPeople>>;

function Page() {
  return (
    <AppShell>
      <Moradores />
    </AppShell>
  );
}

function Moradores() {
  const { data, refresh } = useQuati();
  const [pack, setPack] = useState<People | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!data) return;
    let cancel = false;
    listPeople()
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
    return error ? (
      <Notice tone="bad">{error}</Notice>
    ) : (
      <div className="h-40 animate-pulse rounded-3xl bg-line" />
    );
  }

  const me = pack.me;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl">Pessoas</h1>
        <p className="mt-1 text-sm text-muted">
          Níveis: User (morador), Porteiro, Admin e Síndico. Cada um entra com a própria conta.
        </p>
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      {canManageResidents(me.role) && (
        <ResidentAdministration
          onChange={() => {
            setTick((n) => n + 1);
            refresh();
          }}
        />
      )}
      <ProfileForm
        me={me}
        onDone={() => {
          setTick((n) => n + 1);
          refresh();
        }}
      />
      {canAssignRoles(me.role) && (
        <ul className="space-y-3">
          {pack.people
            .filter((person) => person.userId !== me.userId)
            .map((person) => (
              <PersonEditor
                key={person.userId}
                person={person}
                onDone={() => setTick((n) => n + 1)}
                onError={setError}
              />
            ))}
        </ul>
      )}
      {!canAssignRoles(me.role) && me.role !== "user" && (
        <ul className="divide-y divide-line rounded-3xl border border-line bg-card">
          {pack.people.map((person) => (
            <li
              key={person.userId}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <span>
                <span className="block font-semibold">{person.fullName || person.email}</span>
                <span className="text-muted">
                  {person.unit || "Sem unidade"} · {person.phone || "sem telefone"}
                </span>
              </span>
              <span className="rounded-full bg-moss px-3 py-1 text-xs font-semibold text-pine">
                {ROLE_LABEL[person.role]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProfileForm({ me, onDone }: { me: People["me"]; onDone: () => void }) {
  const [fullName, setFullName] = useState(me.fullName);
  const [phone, setPhone] = useState(me.phone);
  const [unit, setUnit] = useState(me.unit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 rounded-3xl border border-line bg-card p-5"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void updateMyProfile({ data: { fullName, phone, unit } })
          .then(() => {
            setError(null);
            onDone();
          })
          .catch((err: unknown) => setError(errorText(err)))
          .finally(() => setBusy(false));
      }}
    >
      <h2 className="font-display text-2xl">Meu cadastro</h2>
      <p className="text-sm text-muted">
        {ROLE_LABEL[me.role]} · {ROLE_HINT[me.role]}. O telefone com DDD é o destino do WhatsApp.
      </p>
      <input
        className={field}
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        placeholder="Nome"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Unidade
          <input
            className={`${field} mt-1`}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Unidade, ex. Bloco B 302"
            readOnly={me.role === "user" && Boolean(me.unit)}
          />
        </label>
        <input
          className={field}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="WhatsApp com DDD"
        />
      </div>
      {me.role === "user" && me.unit && (
        <p className="text-xs text-muted">Para mudar de unidade, fale com a administração.</p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className={btnClay} disabled={busy} type="submit">
        {busy ? "Salvando…" : "Salvar cadastro"}
      </button>
    </form>
  );
}

function PersonEditor({
  person,
  onDone,
  onError,
}: {
  person: People["people"][number];
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [fullName, setFullName] = useState(person.fullName);
  const [phone, setPhone] = useState(person.phone);
  const [unit, setUnit] = useState(person.unit);
  const [role, setRole] = useState<Role>(person.role);
  const [active, setActive] = useState(person.active);

  return (
    <li className="space-y-3 rounded-3xl border border-line bg-card p-4">
      <p className="text-xs text-muted">{person.email}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <input
          className={field}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="Unidade"
        />
        <input
          className={field}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Telefone"
        />
        <select className={field} value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.map((item) => (
            <option key={item} value={item}>
              {ROLE_LABEL[item]} · {ROLE_HINT[item]}
            </option>
          ))}
        </select>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Acesso ativo
      </label>
      <button
        type="button"
        className={btnClay}
        onClick={() => {
          void updatePerson({
            data: { userId: person.userId, fullName, phone, unit, role, active },
          })
            .then(onDone)
            .catch((err: unknown) => onError(errorText(err)));
        }}
      >
        Salvar nível
      </button>
    </li>
  );
}

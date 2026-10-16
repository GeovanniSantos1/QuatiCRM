import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { themePreference } from "@/lib/theme";

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference, ready } = useTheme();
  const Icon = preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;
  const label = preference === "system" ? "Sistema" : preference === "dark" ? "Escuro" : "Claro";
  return (
    <label className="relative inline-flex shrink-0 items-center" title={`Tema: ${label}`}>
      <span className="sr-only">Tema da interface</span>
      <Icon
        className="pointer-events-none absolute left-3.5 size-4 text-muted"
        aria-hidden="true"
      />
      <select
        aria-label="Tema da interface"
        disabled={!ready}
        value={preference}
        onChange={(event) => setPreference(themePreference(event.target.value))}
        className={`min-h-11 cursor-pointer rounded-lg border border-line bg-card text-sm font-medium text-ink hover:border-pine ${compact ? "w-11 appearance-none pl-11 text-transparent" : "w-36 pr-3 pl-10"} [&_option]:bg-card [&_option]:text-ink`}
      >
        <option value="light">Claro</option>
        <option value="dark">Escuro</option>
        <option value="system">Sistema</option>
      </select>
    </label>
  );
}

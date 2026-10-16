import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { THEME_STORAGE_KEY, themePreference, type ThemePreference } from "@/lib/theme";

const ThemeContext = createContext<{
  preference: ThemePreference;
  ready: boolean;
  resolvedTheme: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [preference, setMode] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolved] = useState<"light" | "dark">("light");

  const apply = useCallback((mode: ThemePreference) => {
    const dark =
      mode === "dark" ||
      (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.dataset.theme = dark ? "dark" : "light";
    root.dataset.themePreference = mode;
    root.style.colorScheme = dark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#101a17" : "#f6f8fa");
    setMode(mode);
    setResolved(dark ? "dark" : "light");
  }, []);

  const setPreference = useCallback(
    (mode: ThemePreference) => {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      } catch {
        /* Theme still works without storage. */
      }
      apply(mode);
    },
    [apply],
  );

  useEffect(() => {
    let stored = document.documentElement.dataset.themePreference;
    try {
      stored = window.localStorage.getItem(THEME_STORAGE_KEY) ?? undefined;
    } catch {
      /* Keep the bootstrap choice. */
    }
    apply(themePreference(stored));
    setReady(true);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (document.documentElement.dataset.themePreference === "system") apply("system");
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null)
        apply(themePreference(event.newValue));
    };
    media.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [apply]);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference, ready }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("Tema fora do provedor.");
  return context;
}

import { readFileSync } from "node:fs";

const LOCAL_KEYS = ["DATABASE_URL", "GROK_PREVIEW_CLIENT_SECRET", "QUATI_SEED_TEST_USERS"];

/** Optional workstation settings. Hosting environment variables always win. */
export function readLocalConfig() {
  try {
    const values = JSON.parse(
      readFileSync(new URL("../.quati/local-config.json", import.meta.url), "utf8"),
    );
    return Object.fromEntries(
      LOCAL_KEYS.filter((key) => typeof values?.[key] === "string").map((key) => [key, values[key]]),
    );
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error("Não foi possível ler a configuração local do Quati.");
  }
}

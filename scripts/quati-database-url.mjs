import { readLocalConfig } from "./local-config.mjs";

/** Server-only connection; credentials are never committed to the repository. */
export const quatiDatabaseUrl = process.env.DATABASE_URL || readLocalConfig().DATABASE_URL;

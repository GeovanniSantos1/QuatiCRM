import { quatiDatabaseUrl } from "./quati-database-url.mjs";
import { readLocalConfig } from "./local-config.mjs";

if (quatiDatabaseUrl) process.env.DATABASE_URL = quatiDatabaseUrl;
await import("./migrate.mjs");
const seedTestUsers = process.env.QUATI_SEED_TEST_USERS ?? readLocalConfig().QUATI_SEED_TEST_USERS;
if (quatiDatabaseUrl && seedTestUsers === "true") await import("./seed-test-users.mjs");

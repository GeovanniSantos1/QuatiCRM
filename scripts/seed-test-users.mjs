/**
 * One email/password account per role. Idempotent: reruns refresh the password
 * and the profile, and never steal síndico from a non-test account.
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import pg from "pg";
import { quatiDatabaseUrl } from "./quati-database-url.mjs";
import { TEST_ACCOUNTS, TEST_PASSWORD } from "./test-accounts.mjs";

const pool = new pg.Pool({ connectionString: quatiDatabaseUrl, max: 1 });
const client = await pool.connect();
const hash = await hashPassword(TEST_PASSWORD);

try {
  await client.query("begin");
  const sindico = await client.query(
    `select email from profiles where role = 'sindico' and email <> $1 limit 1`,
    ["sindico@quati.test"],
  );
  const sindicoTaken = Boolean(sindico.rows[0]);

  for (const account of TEST_ACCOUNTS) {
    const existing = await client.query(`select id from "user" where email = $1`, [account.email]);
    const userId = existing.rows[0]?.id ?? randomUUID();
    if (existing.rows[0]) {
      await client.query(
        `update "user" set name = $2, "emailVerified" = true, "updatedAt" = now() where id = $1`,
        [userId, account.name],
      );
    } else {
      await client.query(
        `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         values ($1, $2, $3, true, now(), now())`,
        [userId, account.name, account.email],
      );
    }

    const credential = await client.query(
      `select id from "account" where "userId" = $1 and "providerId" = 'credential' limit 1`,
      [userId],
    );
    if (credential.rows[0]) {
      await client.query(
        `update "account" set password = $2, "accountId" = $3, "updatedAt" = now() where id = $1`,
        [credential.rows[0].id, hash, userId],
      );
    } else {
      await client.query(
        `insert into "account"
           (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         values ($1, $2, 'credential', $2, $3, now(), now())`,
        [randomUUID(), userId, hash],
      );
    }

    const role = account.role === "sindico" && sindicoTaken ? "admin" : account.role;
    await client.query(
      `insert into profiles (user_id, full_name, email, phone, unit, role, active, registration_status)
       values ($1, $2, $3, $4, $5, $6, true, 'aprovado')
       on conflict (user_id) do update set
         full_name = excluded.full_name,
         email = excluded.email,
         phone = excluded.phone,
         unit = excluded.unit,
         role = excluded.role,
         active = true, registration_status = 'aprovado'`,
      [userId, account.name, account.email, account.phone, account.unit, role],
    );
  }

  await client.query("commit");
  console.log(sindicoTaken ? "[seed] contas de teste atualizadas (síndico real mantido)" : "[seed] contas de teste prontas");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}

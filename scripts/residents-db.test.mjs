import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  saveResidentRequest,
  decideResident,
  createResidentInvitation,
  acceptResidentInvitation,
} from "../src/lib/condo/membership-queries.server.ts";

async function setup() {
  const db = new PGlite();
  for (const file of [
    "0001_auth.sql",
    "0002_quati.sql",
    "0003_vehicles.sql",
    "0004_vehicle_profile_changes.sql",
  ])
    await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  await db.exec(
    "insert into profiles(user_id,full_name,email,unit,role,active) values ('manager','Admin','admin@qa.test','Gestão','admin',true),('legacy','Atual','atual@qa.test','A101','user',true),('inactive','Inativo','inactive@qa.test','A102','user',false)",
  );
  await db.exec(
    readFileSync(new URL("../migrations/0005_resident_registrations.sql", import.meta.url), "utf8"),
  );
  await db.exec(
    `insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values ('new','Novo','novo@qa.test',false,now(),now()),('other','Outro','outro@qa.test',false,now(),now())`,
  );
  await db.exec(
    "insert into profiles(user_id,full_name,email) values ('new','Novo','novo@qa.test'),('other','Outro','outro@qa.test')",
  );
  const sql = async (strings, ...values) =>
    (
      await db.query(
        strings.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
        values,
      )
    ).rows;
  return { db, sql };
}
test("migração preserva acessos atuais e novos perfis aguardam aprovação sem acesso", async () => {
  const { db } = await setup();
  try {
    const rows = (await db.query("select user_id,registration_status,active from profiles")).rows;
    assert.deepEqual(
      rows.find((p) => p.user_id === "legacy"),
      { user_id: "legacy", registration_status: "aprovado", active: true },
    );
    assert.equal(rows.find((p) => p.user_id === "inactive").active, false);
    assert.deepEqual(
      rows.find((p) => p.user_id === "new"),
      { user_id: "new", registration_status: "pendente", active: false },
    );
  } finally {
    await db.close();
  }
});
test("morador não se aprova; decisão usa versão e motivo; recusado pode solicitar de novo", async () => {
  const { db, sql } = await setup();
  try {
    const request = await saveResidentRequest(sql, "new", {
      fullName: "Morador Novo",
      unit: "A201",
      phone: "11999999999",
    });
    assert.equal(request.length, 1);
    assert.equal(
      (
        await decideResident(sql, "other", {
          userId: "new",
          version: 1,
          decision: "aprovado",
          reason: "",
        })
      ).length,
      0,
    );
    assert.equal(
      (
        await decideResident(sql, "manager", {
          userId: "new",
          version: 0,
          decision: "aprovado",
          reason: "",
        })
      ).length,
      0,
    );
    await decideResident(sql, "manager", {
      userId: "new",
      version: 1,
      decision: "recusado",
      reason: "Unidade incorreta",
    });
    assert.equal(
      (await db.query("select active from profiles where user_id='new'")).rows[0].active,
      false,
    );
    await saveResidentRequest(sql, "new", {
      fullName: "Morador Novo",
      unit: "A202",
      phone: "11999999999",
    });
    await decideResident(sql, "manager", {
      userId: "new",
      version: 2,
      decision: "aprovado",
      reason: "",
    });
    assert.equal(
      (await db.query("select active from profiles where user_id='new'")).rows[0].active,
      true,
    );
    assert.equal(
      (
        await saveResidentRequest(sql, "new", {
          fullName: "Troca",
          unit: "Z999",
          phone: "11999999999",
        })
      ).length,
      0,
    );
  } finally {
    await db.close();
  }
});
test("convite exige administração, e-mail correspondente, validade e uso único", async () => {
  const { db, sql } = await setup();
  try {
    const invite = {
      fullName: "Morador Convidado",
      email: "novo@qa.test",
      unit: "B301",
      phone: "11999999999",
    };
    assert.equal((await createResidentInvitation(sql, "other", invite, "secret-hash")).length, 0);
    assert.equal((await createResidentInvitation(sql, "manager", invite, "secret-hash")).length, 1);
    assert.equal((await acceptResidentInvitation(sql, "other", "secret-hash")).length, 0);
    assert.equal((await acceptResidentInvitation(sql, "new", "secret-hash")).length, 1);
    assert.equal((await acceptResidentInvitation(sql, "new", "secret-hash")).length, 0);
    const profile = (
      await db.query(
        "select unit,active,registration_status,role from profiles where user_id='new'",
      )
    ).rows[0];
    assert.deepEqual(profile, {
      unit: "B301",
      active: true,
      registration_status: "aprovado",
      role: "user",
    });
    await createResidentInvitation(
      sql,
      "manager",
      { ...invite, email: "outro@qa.test" },
      "expired-hash",
    );
    await db.exec(
      "update resident_invitations set expires_at=now()-interval '1 second' where token_hash='expired-hash'",
    );
    assert.equal((await acceptResidentInvitation(sql, "other", "expired-hash")).length, 0);
  } finally {
    await db.close();
  }
});

test("recusar um cadastro invalida os convites emitidos antes da recusa", async () => {
  const { db, sql } = await setup();
  try {
    await createResidentInvitation(
      sql,
      "manager",
      { fullName: "Novo", email: "novo@qa.test", unit: "A201", phone: "11999999999" },
      "old-invite",
    );
    await saveResidentRequest(sql, "new", { fullName: "Novo", unit: "A201", phone: "11999999999" });
    await decideResident(sql, "manager", {
      userId: "new",
      version: 1,
      decision: "recusado",
      reason: "Não é morador",
    });
    assert.equal((await acceptResidentInvitation(sql, "new", "old-invite")).length, 0);
  } finally {
    await db.close();
  }
});

test("contas antigas sem perfil conservam acesso, sem aprovar cadastros novos", async () => {
  const { db } = await setup();
  try {
    await db.exec(
      "create table _migrations(name text primary key,applied_at timestamptz not null)",
    );
    await db.exec(
      "insert into _migrations values ('0005_resident_registrations.sql',now()-interval '1 hour')",
    );
    await db.exec(
      `insert into "user"(id,name,email,"emailVerified","createdAt","updatedAt") values ('legacy-auth','Conta antiga','legacy-auth@qa.test',false,now()-interval '1 day',now())`,
    );
    await db.exec(
      readFileSync(
        new URL("../migrations/0006_existing_resident_accounts.sql", import.meta.url),
        "utf8",
      ),
    );
    const row = (
      await db.query("select active,registration_status from profiles where user_id='legacy-auth'")
    ).rows[0];
    assert.deepEqual(row, { active: true, registration_status: "aprovado" });
    assert.equal(
      (await db.query("select active from profiles where user_id='new'")).rows[0].active,
      false,
    );
    assert.equal(
      (await db.query("select active from profiles where user_id='inactive'")).rows[0].active,
      false,
    );
  } finally {
    await db.close();
  }
});

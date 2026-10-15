import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

async function lifecycleDb(withLifecycle = true) {
  const db = new PGlite();
  for (const file of ["0002_quati.sql", "0003_vehicles.sql"]) {
    await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  await db.exec(
    "insert into profiles (user_id, unit) values ('owner','Bloco A 101'),('next','Bloco A 101'),('manager','Gestão')",
  );
  await db.exec(
    "insert into vehicles(id,resident_user_id,unit,plate,model,color) values ('car','owner','Bloco A 101','ABC1234','Civic','Prata')",
  );
  if (withLifecycle)
    await db.exec(
      readFileSync(
        new URL("../migrations/0004_vehicle_profile_changes.sql", import.meta.url),
        "utf8",
      ),
    );
  return db;
}

test("migração corrige reservas antigas de moradores desativados e pode ser reaplicada", async () => {
  const db = await lifecycleDb(false);
  try {
    await db.exec("update profiles set active=false where user_id='owner'");
    const migration = readFileSync(
      new URL("../migrations/0004_vehicle_profile_changes.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    await db.exec(migration);
    assert.equal(
      (await db.query("select status from vehicles where id='car'")).rows[0].status,
      "cancelado",
    );
    assert.equal(
      (await db.query("select count(*)::int as n from notifications where user_id='owner'")).rows[0]
        .n,
      1,
    );
  } finally {
    await db.close();
  }
});

test("mudança de unidade cancela aprovado, libera a vaga antiga e mantém histórico", async () => {
  const db = await lifecycleDb();
  try {
    await db.exec(
      "update vehicles set status='aprovado',reviewed_by='manager',reviewed_at=now() where id='car'",
    );
    await db.exec("update profiles set unit='blóco a-101' where user_id='owner'");
    assert.equal(
      (await db.query("select status from vehicles where id='car'")).rows[0].status,
      "aprovado",
    );
    await db.exec("update profiles set unit='Bloco B 202' where user_id='owner'");
    assert.equal(
      (await db.query("select status from vehicles where id='car'")).rows[0].status,
      "cancelado",
    );
    await db.exec(
      "insert into vehicles(id,resident_user_id,unit,plate,model,color) values ('replacement','next','Bloco A 101','DEF1G23','Corolla','Preto')",
    );
    assert.equal(
      (await db.query("select count(*)::int as n from notifications where user_id='owner'")).rows[0]
        .n,
      1,
    );
  } finally {
    await db.close();
  }
});

test("desativação cancela pedido pendente e reativação exige nova aprovação", async () => {
  const db = await lifecycleDb();
  try {
    await db.exec("update profiles set active=false where user_id='owner'");
    assert.equal(
      (await db.query("select status from vehicles where id='car'")).rows[0].status,
      "cancelado",
    );
    await db.exec("update profiles set active=true where user_id='owner'");
    assert.equal(
      (await db.query("select status from vehicles where id='car'")).rows[0].status,
      "cancelado",
    );
  } finally {
    await db.close();
  }
});

test("banco limita uma vaga por unidade e uma placa ativa, preservando histórico", async () => {
  const db = new PGlite();
  try {
    await db.exec(readFileSync(new URL("../migrations/0002_quati.sql", import.meta.url), "utf8"));
    await db.exec(
      readFileSync(new URL("../migrations/0003_vehicles.sql", import.meta.url), "utf8"),
    );
    await db.exec(
      "insert into profiles (user_id, unit) values ('a', 'Bloco A 101'), ('b', 'Bloco A 101'), ('c', 'Bloco B 101')",
    );
    const insert = (id, owner, unit, plate) =>
      db.query(
        "insert into vehicles (id, resident_user_id, unit, plate, model, color) values ($1,$2,$3,$4,'Civic','Prata')",
        [id, owner, unit, plate],
      );
    await insert("v1", "a", "Bloco A 101", "ABC1234");
    await assert.rejects(insert("v2", "b", "blóco a-101", "DEF1G23"), { code: "23505" });
    await assert.rejects(insert("v3", "c", "Bloco B 101", "ABC1234"), { code: "23505" });
    await db.query(
      "update vehicles set status = 'aprovado', reviewed_by = 'c', reviewed_at = now() where id = 'v1'",
    );
    await assert.rejects(insert("v4", "b", "Bloco A 101", "DEF1G23"), { code: "23505" });
    await db.query("update vehicles set status = 'cancelado' where id = 'v1'");
    await insert("v5", "b", "Bloco A 101", "DEF1G23");
    await db.query(
      "update vehicles set status = 'recusado', rejection_reason = 'Documento divergente', reviewed_by = 'c', reviewed_at = now() where id = 'v5'",
    );
    await insert("v6", "b", "Bloco A 101", "GHI2J34");
    assert.equal((await db.query("select count(*)::int as n from vehicles")).rows[0].n, 3);
    await assert.rejects(
      db.query(
        "insert into vehicles (id,resident_user_id,unit,plate,model,color) values ('bad','c','Bloco B 101','INVALID','Civic','Prata')",
      ),
      { code: "23514" },
    );
  } finally {
    await db.close();
  }
});

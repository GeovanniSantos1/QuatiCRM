import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  insertTicket,
  changeTicket,
  addTicketMessage,
  insertBooking,
  changeBooking,
  saveCommonArea,
} from "../src/lib/condo/operations-queries.server.ts";

async function setup() {
  const db = new PGlite();
  for (const file of [
    "0001_auth.sql",
    "0002_quati.sql",
    "0003_vehicles.sql",
    "0004_vehicle_profile_changes.sql",
    "0005_resident_registrations.sql",
    "0007_operations.sql",
  ])
    await db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  await db.exec(`insert into profiles(user_id,full_name,unit,role,active,registration_status) values
    ('admin','Admin','Gestão','admin',true,'aprovado'),('resident','Morador','A101','user',true,'aprovado'),
    ('other','Outro','A102','user',true,'aprovado'),('guard','Portaria','','porteiro',true,'aprovado'),
    ('pending','Pendente','A103','user',false,'pendente')`);
  const sql = async (strings, ...values) =>
    (
      await db.query(
        strings.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
        values,
      )
    ).rows;
  const date = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10);
  return { db, sql, date };
}

test("chamados preservam privacidade, versão e histórico de resolução", async () => {
  const { db, sql } = await setup();
  try {
    const input = {
      title: "Lâmpada queimada",
      description: "A iluminação do corredor não funciona.",
      category: "manutencao",
      priority: "normal",
    };
    assert.equal((await insertTicket(sql, "pending", input)).length, 0);
    const [ticket] = await insertTicket(sql, "resident", input);
    assert.equal(
      (await addTicketMessage(sql, "other", ticket.id, "Não pode ler nem responder")).length,
      0,
    );
    assert.equal(
      (await addTicketMessage(sql, "guard", ticket.id, "Portaria não vê relatos alheios")).length,
      0,
    );
    assert.equal((await addTicketMessage(sql, "admin", ticket.id, "Vamos verificar.")).length, 1);
    assert.equal(
      (
        await changeTicket(sql, "resident", {
          id: ticket.id,
          version: 0,
          status: "resolvido",
          note: "Eu mesmo aprovo",
        })
      ).length,
      0,
    );
    assert.equal(
      (
        await changeTicket(sql, "admin", {
          id: ticket.id,
          version: 0,
          status: "em_andamento",
          note: "Eletricista acionado.",
        })
      ).length,
      1,
    );
    assert.equal(
      (
        await changeTicket(sql, "admin", {
          id: ticket.id,
          version: 0,
          status: "resolvido",
          note: "Decisão antiga",
        })
      ).length,
      0,
    );
    assert.equal(
      (
        await changeTicket(sql, "admin", {
          id: ticket.id,
          version: 1,
          status: "resolvido",
          note: "Lâmpada substituída.",
        })
      ).length,
      1,
    );
    assert.equal(
      (await db.query("select * from ticket_events where ticket_id=$1", [ticket.id])).rows.length,
      3,
    );
    assert.equal(
      (await db.query("select * from notifications where user_id='resident'")).rows.length,
      3,
    );
  } finally {
    await db.close();
  }
});

test("reservas bloqueiam sobreposição, permitem horários adjacentes e liberam slots ao cancelar", async () => {
  const { db, sql, date } = await setup();
  try {
    const area = {
      id: "",
      name: "Salão de festas",
      description: "Espaço de convivência",
      capacity: 30,
      opens: 480,
      closes: 1320,
      active: true,
    };
    assert.equal((await saveCommonArea(sql, "resident", area)).length, 0);
    const [saved] = await saveCommonArea(sql, "admin", area);
    const input = {
      areaId: saved.id,
      date,
      start: 600,
      end: 720,
      purpose: "Aniversário",
      guests: 20,
    };
    assert.equal((await insertBooking(sql, "guard", input)).length, 0);
    assert.equal((await insertBooking(sql, "pending", input)).length, 0);
    assert.equal((await insertBooking(sql, "resident", { ...input, guests: 31 })).length, 0);
    const [booking] = await insertBooking(sql, "resident", input);
    await assert.rejects(
      insertBooking(sql, "other", { ...input, start: 660, end: 780 }),
      (error) => error.code === "23505",
    );
    assert.equal(
      (await db.query("select * from reservations")).rows.length,
      1,
      "conflict must roll back the reservation too",
    );
    assert.equal((await insertBooking(sql, "other", { ...input, start: 720, end: 780 })).length, 1);
    assert.equal(
      (
        await changeBooking(sql, "other", {
          id: booking.id,
          version: 0,
          status: "cancelado",
          reason: "Não sou o dono",
        })
      ).length,
      0,
    );
    assert.equal(
      (
        await changeBooking(sql, "resident", {
          id: booking.id,
          version: 0,
          status: "aprovado",
          reason: "",
        })
      ).length,
      0,
    );
    assert.equal(
      (
        await changeBooking(sql, "admin", {
          id: booking.id,
          version: 0,
          status: "aprovado",
          reason: "",
        })
      ).length,
      1,
    );
    assert.equal(
      (
        await changeBooking(sql, "admin", {
          id: booking.id,
          version: 0,
          status: "recusado",
          reason: "Decisão antiga",
        })
      ).length,
      0,
    );
    assert.equal(
      (
        await changeBooking(sql, "resident", {
          id: booking.id,
          version: 1,
          status: "cancelado",
          reason: "Mudança de planos",
        })
      ).length,
      1,
    );
    assert.equal((await insertBooking(sql, "other", input)).length, 1);
    await db.query("update profiles set active=false where user_id='other'");
    assert.equal(
      (
        await db.query(
          "select * from reservation_slots where reservation_id in (select id from reservations where resident_user_id='other')",
        )
      ).rows.length,
      0,
    );
    assert.equal((await insertBooking(sql, "resident", input)).length, 1);
  } finally {
    await db.close();
  }
});

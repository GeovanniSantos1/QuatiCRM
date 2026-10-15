import assert from "node:assert/strict";
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import pg from "pg";
import { quatiDatabaseUrl } from "./quati-database-url.mjs";
import { TEST_ACCOUNTS, TEST_PASSWORD } from "./test-accounts.mjs";
import { insertVehicleRequest } from "../src/lib/condo/vehicle-request.server.ts";

const base = process.argv[2] || "http://127.0.0.1:8080";
const label = process.argv[3] || "dev";
const run = `qa-vehicle-${Date.now()}`;
const unit = `QA ${Date.now()}`;
const plate = `QAZ${String(Date.now()).slice(-4)}`;
const secondPlate = `QAX${String(Date.now()).slice(-4)}`;
const pool = new pg.Pool({ connectionString: quatiDatabaseUrl, max: 3 });
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
const users = [];
const errors = [];
const results = [];
const pages = [];
async function actor(role, index = 0) {
  const ctx = await browser.newContext({
    viewport: { width: role === "porteiro" ? 390 : 1440, height: 960 },
    reducedMotion: "reduce",
  });
  const account = TEST_ACCOUNTS.find((a) => a.role === role);
  const response = await ctx.request.post(
    `${base}/api/auth/${role === "resident" ? "sign-up" : "sign-in"}/email`,
    {
      headers: { origin: base },
      data:
        role === "resident"
          ? {
              name: `QA Veículo ${index}`,
              email: `${run}-${index}@quati.test`,
              password: TEST_PASSWORD,
            }
          : { email: account.email, password: TEST_PASSWORD },
    },
  );
  assert.equal(response.ok(), true, `auth ${role}: ${await response.text()}`);
  const body = await response.json();
  if (role === "resident") {
    users.push(body.user.id);
    // Vehicle scenarios start from approved residents; onboarding is covered by residents-e2e.
    await pool.query(
      "insert into profiles(user_id,full_name,email,unit,role,active,registration_status) values ($1,$2,$3,$4,'user',true,'aprovado')",
      [body.user.id, `QA Veículo ${index}`, `${run}-${index}@quati.test`, unit],
    );
  }
  const page = await ctx.newPage();
  pages.push(page);
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(`${base}/veiculos`);
  await page.getByRole("heading", { name: "Veículos", exact: true }).waitFor();
  return { ctx, page };
}
async function shot(page, name) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    name,
  );
  await page.screenshot({ path: `screenshots/vehicles-${label}-${name}.png`, fullPage: true });
}
async function consult(port, value, expected) {
  console.log(`consulta ${value}: ${expected}`);
  await port.page.getByLabel("Placa para consulta", { exact: true }).fill(value);
  const request = port.page.waitForRequest((req) => req.url().includes("_serverFn"));
  request.catch(() => {});
  await port.page
    .locator("form")
    .getByRole("button", { name: "Consultar placa", exact: true })
    .click();
  await port.page.getByRole("heading", { name: expected, exact: true }).waitFor();
  return await request;
}
async function replay(ctx, request) {
  const headers = Object.fromEntries(
    Object.entries(request.headers()).filter(
      ([key]) => key === "content-type" || key.startsWith("x-tsr") || key.startsWith("x-tss"),
    ),
  );
  const response = await ctx.request.fetch(request.url(), {
    method: request.method(),
    headers: { ...headers, origin: base },
    ...(request.postData() ? { data: request.postData() } : {}),
  });
  return await response.text();
}

async function concurrentProfileChange(userId, deactivate) {
  const mover = await pool.connect();
  const requester = await pool.connect();
  let pending;
  try {
    await mover.query("begin");
    await mover.query("select user_id from profiles where user_id = $1 for update", [userId]);
    await requester.query("begin");
    const pid = (await requester.query("select pg_backend_pid() as pid")).rows[0].pid;
    const sql = async (strings, ...values) => {
      const text = strings.reduce((query, part, i) => query + (i ? `$${i}` : "") + part, "");
      return (await requester.query(text, values)).rows;
    };
    pending = insertVehicleRequest(sql, userId, {
      plate: `QAW${String(Date.now()).slice(-4)}`,
      model: "Concurrency QA",
      color: "Prata",
    });
    pending.catch(() => {});
    let locked = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = await pool.query("select wait_event_type from pg_stat_activity where pid=$1", [
        pid,
      ]);
      if (result.rows[0]?.wait_event_type === "Lock") {
        locked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(locked, true, "a solicitação deve aguardar a alteração do perfil");
    if (deactivate)
      await mover.query("update profiles set active=false where user_id=$1", [userId]);
    else
      await mover.query("update profiles set unit=$2 where user_id=$1", [userId, `${unit} MOVED`]);
    await mover.query("commit");
    const created = await pending;
    await requester.query("commit");
    if (deactivate) assert.equal(created.length, 0, "não cadastrar após desativação concorrente");
    else {
      assert.equal(created.length, 1);
      const actual = (await pool.query("select unit from vehicles where id=$1", [created[0].id]))
        .rows[0];
      assert.equal(actual.unit, `${unit} MOVED`, "usar a unidade atual após aguardar o lock");
      await pool.query("update vehicles set status='cancelado' where id=$1", [created[0].id]);
    }
  } finally {
    await mover.query("rollback");
    if (pending) await pending.catch(() => {});
    await requester.query("rollback");
    mover.release();
    requester.release();
  }
}
try {
  const resident = await actor("resident", 1);
  const other = await actor("resident", 2);
  const port = await actor("porteiro");
  const admin = await actor("admin");
  const sindico = await actor("sindico");
  await resident.page.getByLabel("Placa", { exact: true }).fill(plate.toLowerCase());
  await resident.page.getByLabel("Marca e modelo", { exact: true }).fill("Honda Civic QA");
  await resident.page.getByLabel("Cor", { exact: true }).fill("Prata");
  const requestPromise = resident.page.waitForRequest(
    (req) => req.method() === "POST" && req.url().includes("_serverFn"),
  );
  await resident.page.getByRole("button", { name: "Enviar solicitação" }).click();
  const request = await requestPromise;
  await resident.page.getByText("Aguardando aprovação", { exact: true }).waitFor();
  await shot(resident.page, "resident-pending");
  assert.match(await replay(other.ctx, request), /Já existe uma solicitação/);
  await other.page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await other.page.getByText("Este apartamento já tem um veículo", { exact: false }).waitFor();
  results.push("Segundo morador do mesmo apartamento bloqueado no servidor");
  const lookupRequest = await consult(port, plate, "Não liberado");
  await shot(port.page, "port-pending-mobile");
  assert.match(await replay(resident.ctx, lookupRequest), /Consulta de placas disponível apenas/);
  results.push("Pendente bloqueado na portaria; morador não consulta placas de terceiros");
  await admin.page.getByRole("button", { name: "Atualizar", exact: true }).click();
  const card = admin.page.locator("article").filter({ hasText: plate });
  await card.waitFor();
  await shot(admin.page, "admin-pending");
  const reviewPromise = admin.page.waitForRequest(
    (req) => req.method() === "POST" && req.url().includes("_serverFn"),
  );
  await card.getByRole("button", { name: "Aprovar veículo" }).click();
  const reviewRequest = await reviewPromise;
  await card.waitFor({ state: "hidden" });
  assert.match(await replay(resident.ctx, reviewRequest), /Só admin e síndico/);
  assert.match(await replay(port.ctx, reviewRequest), /Só admin e síndico/);
  await consult(port, plate, "Liberado");
  await shot(port.page, "port-approved-mobile");
  results.push(
    "Admin aprova; portaria libera; morador e porteiro não aprovam nem via requisição direta",
  );
  await port.page.getByLabel("Placa para consulta", { exact: true }).fill("ZZZ9Z99");
  assert.equal(await port.page.getByRole("heading", { name: "Liberado", exact: true }).count(), 0);
  await consult(port, "ZZZ9Z99", "Não liberado");
  results.push("Placa desconhecida bloqueada; alteração da placa limpa a autorização anterior");
  await resident.page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await resident.page.getByText("Aprovado", { exact: true }).waitFor();
  await shot(resident.page, "resident-approved-desktop");
  await resident.page.setViewportSize({ width: 390, height: 844 });
  await shot(resident.page, "resident-approved-mobile");
  await resident.page.getByRole("button", { name: "Cancelar cadastro", exact: true }).click();
  await resident.page.getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
  await resident.page.getByRole("heading", { name: "Solicitar cadastro", exact: true }).waitFor();
  await consult(port, plate, "Não liberado");
  results.push("Cancelamento revoga a liberação e permite nova solicitação");
  await resident.page.getByLabel("Placa", { exact: true }).fill(secondPlate);
  await resident.page.getByLabel("Marca e modelo", { exact: true }).fill("Toyota Corolla QA");
  await resident.page.getByLabel("Cor", { exact: true }).fill("Preto");
  await resident.page.getByRole("button", { name: "Enviar solicitação" }).click();
  await resident.page.getByText("Aguardando aprovação", { exact: true }).waitFor();
  await sindico.page.getByRole("button", { name: "Atualizar", exact: true }).click();
  const nextCard = sindico.page.locator("article").filter({ hasText: secondPlate });
  await nextCard.getByRole("button", { name: "Recusar", exact: true }).click();
  await nextCard
    .getByLabel("Motivo da recusa")
    .fill("Cadastro de teste recusado para validar o fluxo.");
  await nextCard.getByRole("button", { name: "Confirmar recusa", exact: true }).click();
  await nextCard.waitFor({ state: "hidden" });
  await consult(port, secondPlate, "Não liberado");
  await resident.page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await resident.page.getByText("Motivo da recusa:", { exact: false }).waitFor();
  await shot(resident.page, "resident-rejected-mobile");
  await resident.page.getByRole("heading", { name: "Solicitar cadastro", exact: true }).waitFor();
  results.push("Síndico recusa com motivo; morador acompanha e pode solicitar novamente");
  await concurrentProfileChange(users[1], false);
  await concurrentProfileChange(users[1], true);
  results.push(
    "Solicitação concorrente com mudança/desativação aguarda o perfil e não reserva unidade antiga",
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    `screenshots/vehicles-${label}-e2e.json`,
    JSON.stringify({ ok: true, results }, null, 2),
  );
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (err) {
  for (const [i, page] of pages.entries()) {
    if (!page.isClosed()) {
      await page.screenshot({
        path: `screenshots/vehicles-${label}-failure-${i}.png`,
        fullPage: true,
      });
      console.error(`page ${i}: ${(await page.locator("body").innerText()).slice(-2000)}`);
    }
  }
  throw err;
} finally {
  await browser.close();
  // Remove only the temporary records created by this run, preserving all real data.
  if (users.length) {
    await pool.query(
      "delete from notifications where user_id = any($1::text[]) or (kind = 'veiculo' and body like $2)",
      [users, `Unidade ${unit}%`],
    );
    await pool.query("delete from vehicles where resident_user_id = any($1::text[])", [users]);
    await pool.query("delete from profiles where user_id = any($1::text[])", [users]);
    await pool.query('delete from "user" where id = any($1::text[])', [users]);
  }
  await pool.end();
}

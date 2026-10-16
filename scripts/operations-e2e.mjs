import assert from "node:assert/strict";
import { chromium } from "playwright";
import pg from "pg";
import { quatiDatabaseUrl } from "./quati-database-url.mjs";
import { TEST_ACCOUNTS, TEST_PASSWORD } from "./test-accounts.mjs";
import { insertBooking } from "../src/lib/condo/operations-queries.server.ts";

const base = process.argv[2] || "http://127.0.0.1:8080",
  label = process.argv[3] || "dev";
const run = `qa-ops-${Date.now()}`,
  users = [],
  pages = [],
  errors = [],
  results = [];
const pool = new pg.Pool({
  connectionString: quatiDatabaseUrl,
  max: 4,
  connectionTimeoutMillis: 15000,
  query_timeout: 20000,
});
const browser = await chromium.launch({ headless: true, channel: "msedge" });
let areaId, ticketId;
async function actor(role, index = 0) {
  const ctx = await browser.newContext({
    viewport: { width: role === "porteiro" ? 390 : 1440, height: 960 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  pages.push(page);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.setDefaultTimeout(12000);
  let id;
  if (role === "user") {
    const email = `${run}-${index}@quati.test`;
    const r = await ctx.request.post(`${base}/api/auth/sign-up/email`, {
      headers: { origin: base },
      data: { name: `Morador de teste ${index}`, email, password: TEST_PASSWORD },
    });
    const body = await r.json();
    assert.ok(r.ok() && body.user?.id, "create QA user");
    id = body.user.id;
    users.push(id);
    await pool.query(
      `insert into profiles(user_id,full_name,email,phone,unit,role,active,registration_status) values($1,$2,$3,'11999999999',$4,'user',true,'aprovado') on conflict(user_id) do update set unit=excluded.unit,active=true,registration_status='aprovado'`,
      [id, `Morador de teste ${index}`, email, `QA-OPS-${index}`],
    );
  } else {
    const account = TEST_ACCOUNTS.find((a) => a.role === role);
    const r = await ctx.request.post(`${base}/api/auth/sign-in/email`, {
      headers: { origin: base },
      data: { email: account.email, password: TEST_PASSWORD },
    });
    assert.ok(r.ok(), `login ${role}`);
  }
  return { ctx, page, id };
}
async function ready(page, path = "/chamados") {
  await page.goto(base + path);
  await page
    .getByRole("heading", {
      name: path.startsWith("/reservas") ? "Reservas de áreas comuns" : "Chamados e manutenção",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", {
      name: path.startsWith("/reservas") ? "Atualizar reservas" : "Atualizar chamados",
      exact: true,
    })
    .waitFor();
}
async function shot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    name + " no overflow",
  );
  await page.screenshot({ path: `screenshots/operations-${label}-${name}.png`, fullPage: true });
}
async function replay(ctx, req) {
  const headers = Object.fromEntries(
    Object.entries(req.headers()).filter(
      ([k]) => k === "content-type" || k.startsWith("x-tsr") || k.startsWith("x-tss"),
    ),
  );
  return (
    await ctx.request.fetch(req.url(), {
      method: req.method(),
      headers: { ...headers, origin: base },
      data: req.postData(),
    })
  ).text();
}
async function requestUI(actor, purpose, date) {
  const page = actor.page;
  await ready(page, "/reservas");
  await page.getByRole("button", { name: "Solicitar reserva", exact: true }).click();
  await page.getByLabel("Área comum", { exact: true }).selectOption(areaId);
  await page.getByLabel("Data da reserva", { exact: true }).fill(date);
  await page.getByLabel("Horário de início", { exact: true }).selectOption("10:00");
  await page.getByLabel("Horário de término", { exact: true }).selectOption("12:00");
  await page.getByLabel("Finalidade", { exact: true }).fill(purpose);
  await page.getByLabel("Número de pessoas", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Enviar solicitação", exact: true }).click();
}
try {
  const resident = await actor("user", 1),
    other = await actor("user", 2),
    admin = await actor("admin"),
    guard = await actor("porteiro");
  console.log("QA: usuários prontos");
  await ready(resident.page);
  await resident.page.getByRole("button", { name: "Novo chamado", exact: true }).click();
  await resident.page.getByLabel("Assunto", { exact: true }).fill("Iluminação do corredor");
  await resident.page
    .getByLabel("Descrição", { exact: true })
    .fill("A lâmpada próxima ao elevador precisa ser substituída.");
  await resident.page.getByRole("button", { name: "Enviar chamado", exact: true }).click();
  await resident.page
    .getByRole("heading", { name: "Iluminação do corredor", level: 2, exact: true })
    .waitFor();
  ticketId = new URL(resident.page.url()).searchParams.get("id");
  assert.ok(ticketId);
  console.log("QA: chamado criado");
  await ready(other.page, `/chamados?id=${ticketId}`);
  await other.page.getByRole("alert").filter({ hasText: "sem permissão" }).waitFor();
  assert.equal(await other.page.getByText("Iluminação do corredor", { exact: true }).count(), 0);
  await ready(admin.page, `/chamados?id=${ticketId}`);
  await admin.page.getByLabel("Nova situação", { exact: true }).selectOption("em_andamento");
  console.log("QA: atualização selecionada");
  await admin.page
    .getByLabel("Motivo ou solução", { exact: true })
    .fill("Eletricista acionado para verificar a iluminação.");
  const [changeReq] = await Promise.all([
    admin.page.waitForRequest(
      (r) => r.method() === "POST" && (r.postData() || "").includes("em_andamento"),
    ),
    admin.page.getByRole("button", { name: "Atualizar situação", exact: true }).click(),
  ]);
  await admin.page
    .locator("ol")
    .getByText("Eletricista acionado para verificar a iluminação.", { exact: true })
    .waitFor();
  console.log("QA: andamento salvo");
  assert.match(await replay(resident.ctx, changeReq), /não permitida|alterado/);
  await resident.page.getByRole("button", { name: "Atualizar chamados", exact: true }).click();
  await resident.page
    .getByLabel("Sua mensagem", { exact: true })
    .fill("Obrigado, o problema está no terceiro andar.");
  await resident.page.getByRole("button", { name: "Enviar mensagem", exact: true }).click();
  await resident.page
    .locator("p")
    .filter({ hasText: /^Obrigado, o problema está no terceiro andar\.$/ })
    .waitFor();
  await admin.page.getByLabel("Nova situação", { exact: true }).selectOption("resolvido");
  await admin.page
    .getByLabel("Motivo ou solução", { exact: true })
    .fill("Lâmpada substituída e iluminação normalizada.");
  await admin.page.getByRole("button", { name: "Atualizar situação", exact: true }).click();
  await admin.page
    .locator("ol")
    .getByText("Lâmpada substituída e iluminação normalizada.", { exact: true })
    .waitFor();
  await shot(admin.page, "tickets-desktop");
  await admin.page.setViewportSize({ width: 390, height: 844 });
  await shot(admin.page, "tickets-mobile");
  await admin.page.getByText("Mais", { exact: true }).click();
  await admin.page
    .getByRole("navigation", { name: "Navegação no celular" })
    .getByRole("link", { name: "Veículos", exact: true })
    .waitFor();
  await admin.page.setViewportSize({ width: 1440, height: 960 });
  await pool.query(
    `insert into ticket_messages(id,ticket_id,author_id,body,created_at) select $1||':'||n,$2,$3,case when n=201 then 'Última resposta de regressão' else 'Mensagem histórica '||n end,now()+n*interval '1 millisecond' from generate_series(1,201)n`,
    [run, ticketId, resident.id],
  );
  await admin.page.reload();
  await admin.page.getByText("Última resposta de regressão", { exact: true }).waitFor();
  await admin.page
    .getByText("Mostrando as 200 mensagens mais recentes.", { exact: true })
    .waitFor();
  results.push(
    "Chamado: criação, privacidade, conversa, andamento, resolução, replay bloqueado e respostas recentes após 200 mensagens.",
  );
  console.log("QA: fluxo de chamado verificado");

  await ready(admin.page, "/reservas");
  await admin.page.getByRole("button", { name: "Gerenciar áreas", exact: true }).click();
  await admin.page.getByLabel("Nome da área", { exact: true }).fill(`Salão de convivência ${run}`);
  await admin.page.getByLabel("Capacidade de pessoas", { exact: true }).fill("20");
  await admin.page
    .getByLabel("Orientações de uso", { exact: true })
    .fill("Deixe o espaço limpo após o uso.");
  await admin.page.getByRole("button", { name: "Cadastrar área", exact: true }).click();
  await admin.page
    .getByText("Área atualizada. As reservas existentes foram mantidas.", { exact: true })
    .waitFor();
  areaId = (
    await pool.query("select id from common_areas where name=$1", [`Salão de convivência ${run}`])
  ).rows[0].id;
  console.log("QA: área cadastrada");
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
    new Date(Date.now() + 4 * 86400000),
  );
  await requestUI(resident, "Encontro de família", date);
  await resident.page.getByText("Reserva solicitada.", { exact: false }).waitFor();
  await requestUI(other, "Outro encontro", date);
  await other.page
    .getByRole("alert")
    .filter({ hasText: "horário acabou de ser ocupado" })
    .waitFor();
  console.log("QA: conflito recusado");
  await ready(admin.page, "/reservas");
  let card = admin.page.locator("article").filter({ hasText: "Encontro de família" });
  await card.getByRole("button", { name: "Aprovar", exact: true }).click();
  await card.getByRole("button", { name: "Confirmar aprovação", exact: true }).click();
  await card.getByText("Aprovada", { exact: true }).waitFor();
  await ready(guard.page, "/reservas");
  await guard.page.getByLabel("Data da agenda", { exact: true }).fill(date);
  await guard.page.locator("article").filter({ hasText: "Encontro de família" }).waitFor();
  assert.equal(
    await guard.page.getByRole("button", { name: "Solicitar reserva", exact: true }).count(),
    0,
  );
  await ready(resident.page, "/reservas");
  card = resident.page.locator("article").filter({ hasText: "Encontro de família" });
  await card.getByRole("button", { name: "Cancelar reserva", exact: true }).click();
  await card
    .getByLabel("Motivo do cancelamento", { exact: true })
    .fill("Alteração de planos da família.");
  await card.getByRole("button", { name: "Confirmar cancelamento", exact: true }).click();
  await card.getByText("Cancelada", { exact: true }).waitFor();
  await other.page.getByRole("button", { name: "Enviar solicitação", exact: true }).click();
  await other.page.getByText("Reserva solicitada.", { exact: false }).waitFor();

  const clients = await Promise.all([pool.connect(), pool.connect()]);
  const sqlFor =
    (client) =>
    async (strings, ...values) =>
      (
        await client.query(
          strings.reduce((s, p, i) => s + (i ? `$${i}` : "") + p, ""),
          values,
        )
      ).rows;
  try {
    const input = { areaId, date, start: 900, end: 960, purpose: "Concorrência real", guests: 2 };
    const concurrent = await Promise.allSettled([
      insertBooking(sqlFor(clients[0]), resident.id, input),
      insertBooking(sqlFor(clients[1]), other.id, input),
    ]);
    assert.equal(
      concurrent.filter((r) => r.status === "fulfilled" && r.value.length === 1).length,
      1,
    );
    assert.equal(
      concurrent.filter((r) => r.status === "rejected" && r.reason.code === "23505").length,
      1,
    );
  } finally {
    clients.forEach((client) => client.release());
  }
  await ready(admin.page, "/reservas");
  await admin.page.getByLabel("Data da agenda", { exact: true }).fill(date);
  await admin.page.getByText("15:00–16:00", { exact: true }).first().waitFor();
  await shot(admin.page, "reservations-desktop");
  await admin.page.setViewportSize({ width: 390, height: 844 });
  await shot(admin.page, "reservations-mobile");
  results.push(
    "Reservas: área criada, sobreposição recusada, aprovação, consulta pela portaria, cancelamento e horário liberado. Concorrência PostgreSQL: uma única reserva aceita.",
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, base, results, errors }));
} catch (error) {
  console.error("QA falhou:", error.message);
  for (let i = 0; i < pages.length; i++)
    await pages[i]
      .screenshot({
        path: `screenshots/operations-${label}-failure-${i}.png`,
        fullPage: true,
        timeout: 5000,
      })
      .catch(() => {});
  throw error;
} finally {
  await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
  const ids = (
    await pool.query(
      "select id from condo_tickets where resident_user_id=any($1::text[]) union select id from reservations where resident_user_id=any($1::text[])",
      [users],
    )
  ).rows.map((r) => r.id);
  if (ids.length)
    await pool.query("delete from notifications where split_part(id,':',1)=any($1::text[])", [ids]);
  await pool.query("delete from reservations where resident_user_id=any($1::text[])", [users]);
  await pool.query("delete from condo_tickets where resident_user_id=any($1::text[])", [users]);
  if (areaId) await pool.query("delete from common_areas where id=$1", [areaId]);
  await pool.query("delete from notifications where user_id=any($1::text[])", [users]);
  await pool.query("delete from profiles where user_id=any($1::text[])", [users]);
  await pool.query('delete from "user" where id=any($1::text[])', [users]);
  await pool.end();
}
process.exit(0);

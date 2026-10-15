import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
import pg from "pg";
import { quatiDatabaseUrl } from "./quati-database-url.mjs";
import { TEST_ACCOUNTS, TEST_PASSWORD } from "./test-accounts.mjs";
const base = process.argv[2] || "http://127.0.0.1:8080";
const label = process.argv[3] || "dev";
const prefix = `qa-resident-${Date.now()}`;
const pool = new pg.Pool({ connectionString: quatiDatabaseUrl, max: 1 });
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
const users = [];
const emails = [];
const pages = [];
const errors = [];
const results = [];
async function context(mobile = false) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  pages.push(page);
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return { ctx, page };
}
async function track(actor) {
  const response = await actor.ctx.request.get(`${base}/api/auth/get-session`);
  const body = await response.json();
  assert.ok(body?.user?.id);
  users.push(body.user.id);
}
async function staff(role) {
  const actor = await context();
  const account = TEST_ACCOUNTS.find((a) => a.role === role);
  const response = await actor.ctx.request.post(`${base}/api/auth/sign-in/email`, {
    headers: { origin: base },
    data: { email: account.email, password: TEST_PASSWORD },
  });
  assert.ok(response.ok(), `login ${role}`);
  await actor.page.goto(`${base}/moradores`);
  await actor.page.getByRole("heading", { name: "Meu cadastro", exact: true }).waitFor();
  return actor;
}
async function shot(page, name) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
    name,
  );
  await page.screenshot({ path: `screenshots/residents-${label}-${name}.png`, fullPage: true });
}
async function replay(ctx, request) {
  const headers = Object.fromEntries(
    Object.entries(request.headers()).filter(
      ([key]) => key === "content-type" || key.startsWith("x-tsr") || key.startsWith("x-tss"),
    ),
  );
  return await (
    await ctx.request.fetch(request.url(), {
      method: request.method(),
      headers: { ...headers, origin: base },
      ...(request.postData() ? { data: request.postData() } : {}),
    })
  ).text();
}
async function newSignup(actor, index, viaInvite = false) {
  const email = `${prefix}-${index}@quati.test`;
  emails.push(email);
  if (!viaInvite) await actor.page.goto(`${base}/login?cadastro=true`);
  await actor.page.getByRole("heading", { name: "Crie sua conta", exact: true }).waitFor();
  await actor.page.waitForFunction(() =>
    Array.from(document.querySelectorAll("form")).some((form) =>
      Object.keys(form).some((k) => k.startsWith("__reactProps")),
    ),
  );
  await actor.page.getByLabel("Nome completo", { exact: true }).fill(`QA Cadastro ${index}`);
  await actor.page.getByLabel("E-mail", { exact: true }).fill(email);
  await actor.page.getByLabel("Senha", { exact: true }).fill(TEST_PASSWORD);
  await actor.page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await actor.page.waitForURL(viaInvite ? "**/convite/*" : "**/painel", {
    waitUntil: "domcontentloaded",
  });
  await track(actor);
  return email;
}
async function createInvite(admin, index) {
  const email = `${prefix}-${index}@quati.test`;
  if (!emails.includes(email)) emails.push(email);
  await admin.page.getByRole("button", { name: "Cadastrar morador", exact: true }).click();
  const form = admin.page.locator("form").filter({
    has: admin.page.getByRole("button", { name: "Criar convite aprovado", exact: true }),
  });
  await form.getByLabel("Nome completo", { exact: true }).fill(`QA Convite ${index}`);
  await form.getByLabel("E-mail do morador", { exact: true }).fill(email);
  await form.getByLabel("Unidade / apartamento", { exact: true }).fill(`QA ${prefix} ${index}`);
  await form.getByLabel("WhatsApp com DDD", { exact: true }).fill("11999999999");
  await form.getByRole("button", { name: "Criar convite aprovado", exact: true }).click();
  await admin.page.getByText("Convite pronto para compartilhar", { exact: true }).waitFor();
  return await admin.page.getByLabel("Link de ativação", { exact: true }).inputValue();
}
try {
  const admin = await staff("admin");
  const sindico = await staff("sindico");
  const porteiro = await staff("porteiro");
  const resident = await context(true);
  const email = await newSignup(resident, 1);
  await resident.page.getByRole("heading", { name: "Dados do morador", exact: true }).waitFor();
  await resident.page.getByLabel("Unidade / apartamento", { exact: true }).fill(`QA ${prefix} 1`);
  await resident.page.getByLabel("WhatsApp com DDD", { exact: true }).fill("11999999999");
  await resident.page.getByRole("button", { name: "Solicitar aprovação", exact: true }).click();
  await resident.page.getByRole("heading", { name: "Cadastro em análise", exact: true }).waitFor();
  await shot(resident.page, "pending-mobile");
  await admin.page.goto(`${base}/financeiro`);
  const financeRequests = [];
  admin.page.on("request", (r) => {
    if (r.url().includes("_serverFn")) financeRequests.push(r);
  });
  await admin.page.getByRole("heading", { name: "Lançamentos", exact: true }).waitFor();
  await admin.page.reload();
  await admin.page.getByRole("heading", { name: "Lançamentos", exact: true }).waitFor();
  assert.match(
    await replay(resident.ctx, financeRequests.at(-1)),
    /cadastro de morador ainda não foi aprovado/,
  );
  results.push("Cadastro público pendente bloqueia API financeira e módulos do condomínio");
  await admin.page.goto(`${base}/moradores`);
  await admin.page.getByRole("heading", { name: "Cadastros e convites", exact: true }).waitFor();
  let card = admin.page.locator("article").filter({ hasText: email });
  await card.waitFor();
  await shot(admin.page, "requests-desktop");
  await card.getByRole("button", { name: "Recusar cadastro", exact: true }).click();
  await card
    .getByLabel("Motivo da recusa", { exact: true })
    .fill("Confirme a unidade informada no cadastro.");
  const reviewPromise = admin.page.waitForRequest(
    (r) => r.method() === "POST" && r.url().includes("_serverFn"),
  );
  await card.getByRole("button", { name: "Confirmar recusa", exact: true }).click();
  const reviewRequest = await reviewPromise;
  await card.waitFor({ state: "hidden" });
  assert.match(await replay(porteiro.ctx, reviewRequest), /Somente admin e síndico/);
  await resident.page.getByRole("button", { name: "Verificar situação", exact: true }).click();
  await resident.page
    .getByRole("heading", { name: "Cadastro não aprovado", exact: true })
    .waitFor();
  await resident.page
    .getByText("Motivo: Confirme a unidade informada no cadastro.", { exact: true })
    .waitFor();
  await shot(resident.page, "rejected-mobile");
  if (await resident.page.getByRole("button", { name: "Corrigir dados", exact: true }).count())
    await resident.page.getByRole("button", { name: "Corrigir dados", exact: true }).click();
  await resident.page.getByLabel("Unidade / apartamento", { exact: true }).fill(`QA ${prefix} 2`);
  await resident.page
    .getByRole("button", { name: "Enviar novamente para análise", exact: true })
    .click();
  await resident.page.getByRole("heading", { name: "Cadastro em análise", exact: true }).waitFor();
  assert.match(await replay(admin.ctx, reviewRequest), /cadastro foi alterado ou já analisado/);
  await sindico.page.getByRole("button", { name: "Atualizar cadastros", exact: true }).click();
  card = sindico.page.locator("article").filter({ hasText: email });
  await card.getByRole("button", { name: "Aprovar morador", exact: true }).click();
  await card.waitFor({ state: "hidden" });
  await resident.page.getByRole("button", { name: "Verificar situação", exact: true }).click();
  await resident.page.getByRole("heading", { name: "Central de avisos", exact: true }).waitFor();
  results.push(
    "Admin recusa com motivo; morador corrige; síndico aprova; decisões antigas e porteiro são bloqueados",
  );
  await admin.page.getByRole("button", { name: "Atualizar cadastros", exact: true }).click();
  const inviteUrl = await createInvite(admin, 2);
  await shot(admin.page, "invite-share-desktop");
  assert.match(
    await admin.page
      .getByRole("link", { name: "Enviar por WhatsApp", exact: true })
      .getAttribute("href"),
    /^https:\/\/wa.me\//,
  );
  assert.match(
    await admin.page
      .getByRole("link", { name: "Enviar por e-mail", exact: true })
      .getAttribute("href"),
    /^mailto:/,
  );
  const invited = await context(true);
  await invited.page.goto(inviteUrl);
  await invited.page
    .getByRole("link", { name: "Criar minha conta e continuar", exact: true })
    .waitFor();
  await shot(invited.page, "invitation-mobile");
  await invited.page
    .getByRole("link", { name: "Criar minha conta e continuar", exact: true })
    .click();
  await newSignup(invited, 2, true);
  await invited.page.getByRole("button", { name: "Ativar meu cadastro", exact: true }).click();
  await invited.page.getByRole("heading", { name: "Central de avisos", exact: true }).waitFor();
  await shot(invited.page, "activated-mobile");
  results.push(
    "Admin pré-cadastra; link tem ações WhatsApp/e-mail; convidado define senha e ativa cadastro aprovado",
  );
  const oldUrl = await createInvite(admin, 3);
  await admin.page.getByRole("button", { name: "Convites", exact: true }).click();
  const invitation = admin.page.locator("article").filter({ hasText: `${prefix}-3@quati.test` });
  await invitation.getByRole("button", { name: "Gerar novo link", exact: true }).click();
  await admin.page.getByText("Convite pronto para compartilhar", { exact: true }).waitFor();
  const newUrl = await admin.page.getByLabel("Link de ativação", { exact: true }).inputValue();
  assert.notEqual(oldUrl, newUrl);
  const guest = await context(true);
  await guest.page.goto(oldUrl);
  await guest.page.getByRole("alert").filter({ hasText: "convite é inválido" }).waitFor();
  await invitation.getByRole("button", { name: "Revogar convite", exact: true }).click();
  await invitation.getByRole("button", { name: "Confirmar revogação", exact: true }).click();
  await guest.page.goto(newUrl);
  await guest.page.getByRole("alert").filter({ hasText: "convite é inválido" }).waitFor();
  results.push("Renovação invalida o link anterior; revogação impede ativação");
  assert.deepEqual(errors, []);
  writeFileSync(
    `screenshots/residents-${label}-e2e.json`,
    JSON.stringify({ ok: true, results }, null, 2),
  );
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (error) {
  for (const [i, page] of pages.entries()) {
    if (!page.isClosed())
      await page.screenshot({
        path: `screenshots/residents-${label}-failure-${i}.png`,
        fullPage: true,
      });
  }
  throw error;
} finally {
  await browser.close();
  await pool.query("delete from resident_invitations where email=any($1::text[])", [emails]);
  if (users.length) {
    await pool.query(
      "delete from notifications where user_id=any($1::text[]) or split_part(id,':member-pending:',1)=any($1::text[])",
      [users],
    );
    await pool.query("delete from profiles where user_id=any($1::text[])", [users]);
    await pool.query('delete from "user" where id=any($1::text[])', [users]);
  }
  await pool.end();
}

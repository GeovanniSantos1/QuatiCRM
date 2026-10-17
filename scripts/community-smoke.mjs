import assert from "node:assert/strict";
import { chromium } from "playwright";
import pg from "pg";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { readLocalConfig } from "./local-config.mjs";
import { TEST_ACCOUNTS, TEST_PASSWORD } from "./test-accounts.mjs";

const base = process.argv[2] ?? "http://127.0.0.1:8080";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("This test creates local fixtures and only runs locally.");
const config = readLocalConfig();
if (config.QUATI_SEED_TEST_USERS !== "true") throw new Error("Local fixtures must be enabled.");
const db = new pg.Client({ connectionString: config.DATABASE_URL });
await db.connect();
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
const errors = [];
const id = randomUUID(),
  token = randomBytes(32).toString("hex");
let pollId;
await mkdir("screenshots", { recursive: true });
async function login(page, role, path = "/login") {
  await page.goto(base + path);
  await page.getByLabel("Tema da interface").selectOption("light");
  await page.waitForFunction(
    () =>
      !Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent.includes("Continuar com Google"),
      )?.disabled,
  );
  await page
    .getByLabel("E-mail", { exact: true })
    .fill(TEST_ACCOUNTS.find((a) => a.role === role).email);
  await page.getByLabel("Senha", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Entrar com e-mail", exact: true }).click();
}
try {
  const resident = (
    await db.query("select user_id,full_name,unit from profiles where email=$1", [
      TEST_ACCOUNTS.find((a) => a.role === "user").email,
    ])
  ).rows[0];
  const admin = (
    await db.query("select user_id from profiles where email=$1", [
      TEST_ACCOUNTS.find((a) => a.role === "admin").email,
    ])
  ).rows[0];
  await db.query(
    "insert into deliveries(id,resident_user_id,unit,recipient_name,carrier,description,received_by,sign_token) values($1,$2,$3,$4,'Correios','QA comprovante de assinatura',$5,$6)",
    [id, resident.user_id, resident.unit, resident.full_name, admin.user_id, token],
  );
  const publicContext = await browser.newContext();
  const sign = await publicContext.newPage();
  sign.on("pageerror", (e) => errors.push(e.message));
  await sign.goto(base + "/assinar/" + token);
  const canvas = sign.locator("canvas");
  await canvas.waitFor();
  // Wait for hydration, then draw a real stroke and save through the public flow.
  await sign.getByLabel("Tema da interface").selectOption("light");
  const box = await canvas.boundingBox();
  await sign.mouse.move(box.x + 30, box.y + 80);
  await sign.mouse.down();
  await sign.mouse.move(box.x + 90, box.y + 35, { steps: 9 });
  await sign.mouse.move(box.x + 130, box.y + 110, { steps: 9 });
  await sign.mouse.move(box.x + 210, box.y + 65, { steps: 9 });
  await sign.mouse.up();
  await sign.getByRole("button", { name: "Confirmar assinatura", exact: true }).click();
  await sign
    .getByText("Assinatura registrada. Pode retirar na portaria.", { exact: true })
    .waitFor();
  const saved = (
    await db.query("select signature_data,signer_name,signed_at from deliveries where id=$1", [id])
  ).rows[0];
  assert.ok(saved.signature_data.startsWith("data:image/png;base64,"));
  assert.ok(saved.signed_at);

  const adminContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await adminContext.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page, "admin");
  await page.waitForURL("**/painel");
  await page.goto(base + "/entregas");
  const card = page.locator("li").filter({ hasText: "QA comprovante de assinatura" });
  await card.getByRole("link", { name: /Ver assinatura|Abrir/ }).click();
  await page.waitForURL("**/entregas/" + id);
  const image = page.getByRole("img", { name: /Assinatura/ });
  await image.waitFor({ timeout: 6000 });
  assert.equal(await image.getAttribute("src"), saved.signature_data);
  assert.ok(await image.evaluate((img) => img.complete && img.naturalWidth > 0));
  await page.screenshot({ path: "screenshots/community-signature-desktop.png", fullPage: true });
  await page.getByLabel("Tema da interface").selectOption("dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "screenshots/community-signature-mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  console.log("signature visible to admin");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar assinatura", exact: true }).click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), `assinatura-${id}.png`);
  await page.goto(base + "/enquetes");
  await page.getByPlaceholder("Pergunta", { exact: true }).fill("QA compartilhar " + id);
  await page.getByPlaceholder("Contexto para os moradores").fill("Teste local de grupo e votação.");
  await page.getByRole("button", { name: "Abrir enquete e gerar WhatsApp", exact: true }).click();
  const sharePanel = page.getByRole("region", { name: "Compartilhar enquete" });
  await sharePanel.waitFor();
  const commonUrl = await page.getByLabel("Link da enquete", { exact: true }).inputValue();
  pollId = new URL(commonUrl).searchParams.get("enquete");
  assert.ok(pollId);
  assert.equal(new URL(commonUrl).pathname, "/login");
  const whatsapp = await sharePanel
    .getByRole("link", { name: "Compartilhar com todos no WhatsApp" })
    .getAttribute("href");
  const wa = new URL(whatsapp);
  assert.equal(wa.origin + wa.pathname, "https://wa.me/");
  assert.ok(wa.searchParams.get("text").includes(commonUrl));
  assert.ok(!wa.searchParams.get("text").includes("/votar/"));
  await sharePanel.getByRole("button", { name: "Copiar link", exact: true }).click();
  await sharePanel.getByRole("status").waitFor();
  await page.getByRole("link", { name: "QA compartilhar " + id }).click();
  await page.waitForURL("**/enquetes/" + pollId);
  await sharePanel.waitFor();
  await page.reload();
  await sharePanel.waitFor();
  await page.screenshot({ path: "screenshots/community-share-mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "screenshots/community-share-desktop.png", fullPage: true });

  const residentContext = await browser.newContext();
  const voter = await residentContext.newPage();
  voter.on("pageerror", (e) => errors.push(e.message));
  await login(voter, "user", "/login?enquete=" + pollId);
  await voter.waitForURL("**/enquetes/" + pollId);
  await voter.getByRole("button", { name: "Confirmar voto", exact: true }).waitFor();
  assert.equal(await voter.getByRole("region", { name: "Compartilhar enquete" }).count(), 0);
  await voter.getByRole("radio", { name: "Sim", exact: true }).check();
  await voter.getByRole("button", { name: "Confirmar voto", exact: true }).click();
  await voter
    .getByRole("radio", { name: "Sim", exact: true })
    .waitFor({ state: "detached" });
  const vote = (
    await db.query(
      "select count(*)::int as n from poll_ballots where poll_id=$1 and unit=$2 and voted_at is not null",
      [pollId, resident.unit],
    )
  ).rows[0];
  assert.equal(vote.n, 1);
  await voter.goto(commonUrl);
  await voter.waitForURL("**/enquetes/" + pollId);
  await voter.getByRole("heading", { name: "QA compartilhar " + id }).waitFor();
  assert.equal(await voter.getByRole("button", { name: "Confirmar voto", exact: true }).count(), 0);
  // Other residents cannot retrieve the private delivery signature.
  await db.query("update deliveries set resident_user_id=$1 where id=$2", [admin.user_id, id]);
  await voter.goto(base + "/entregas/" + id);
  await voter.getByText("Sem permissão.", { exact: true }).waitFor();
  assert.equal(await voter.getByRole("img", { name: /Assinatura/ }).count(), 0);
  await page.getByRole("button", { name: "Encerrar enquete", exact: true }).click();
  await sharePanel.waitFor({ state: "detached" });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      signature: "passed",
      download: "passed",
      sharing: "passed",
      loginReturn: "passed",
      vote: "passed",
      privateSignature: "passed",
      closedPoll: "passed",
    }),
  );
} finally {
  await db.query("delete from deliveries where id=$1", [id]);
  if (pollId) {
    await db.query("delete from notifications where link_path=$1", ["/enquetes/" + pollId]);
    await db.query("delete from polls where id=$1", [pollId]);
  }
  await db.end();
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 4000))]);
}
process.exit(0);

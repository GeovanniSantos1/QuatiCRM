import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { TEST_ACCOUNTS, TEST_PASSWORD } from "./test-accounts.mjs";

const base = process.argv[2] || "http://127.0.0.1:8080";
const label = process.argv[3] || "dev";
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
const results = [];
try {
  for (const [device, viewport] of Object.entries({
    desktop: { width: 1440, height: 960 },
    mobile: { width: 390, height: 844 },
  })) {
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
      console.error(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
        console.error(msg.text());
      }
    });
    await page.goto(`${base}/login`);
    await page.getByRole("heading", { name: "Bem-vindo de volta" }).waitFor();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("form")).some((form) =>
        Object.keys(form).some((key) => key.startsWith("__reactProps")),
      ),
    );
    await page.screenshot({ path: `screenshots/crm-${label}-login-${device}.png`, fullPage: true });
    await page
      .getByRole("textbox", { name: "E-mail", exact: true })
      .fill(TEST_ACCOUNTS.find((a) => a.role === "sindico").email);
    await page.getByLabel("Senha", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Entrar com e-mail" }).click();
    try {
      await page.waitForURL("**/painel", { timeout: 30000, waitUntil: "domcontentloaded" });
    } catch (err) {
      console.error(await page.locator("body").innerText());
      throw err;
    }
    await page.getByRole("heading", { name: "Central de avisos" }).waitFor({ timeout: 30000 });
    for (const route of ["painel", "entregas", "enquetes", "financeiro", "moradores"]) {
      if (route !== "painel")
        await page
          .locator(viewport.width >= 768 ? "aside nav" : ".crm-bottom-nav")
          .locator(`a[href="/${route}"]`)
          .click();
      await page.waitForURL(`**/${route}`, { waitUntil: "domcontentloaded" });
      await page.locator("main h1").waitFor();
      if (route === "moradores")
        await page.getByRole("heading", { name: "Meu cadastro" }).waitFor();
      if (route === "financeiro")
        await page.getByRole("heading", { name: "Lançamentos", exact: true }).waitFor();
      if (route === "entregas")
        await page.getByRole("heading", { name: "Registrar encomenda" }).waitFor();
      if (route === "enquetes") await page.getByRole("heading", { name: "Nova enquete" }).waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) throw new Error(`${device}/${route}: horizontal overflow`);
      await page.screenshot({
        path: `screenshots/crm-${label}-${route}-${device}.png`,
        fullPage: true,
      });
      results.push({ device, route, overflow, heading: await page.locator("main h1").innerText() });
    }
    if (errors.length) throw new Error(`${device}: ${errors.join("; ")}`);
    await context.close();
  }
  writeFileSync(`screenshots/crm-${label}-qa.json`, JSON.stringify({ ok: true, results }, null, 2));
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally {
  await browser.close();
}

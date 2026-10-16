import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const base = process.argv[2] ?? "http://127.0.0.1:8080";
const host = new URL(base).hostname;
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(host) &&
  process.env.BROWSER_ALLOW_EXTERNAL_HOST !== "1"
)
  throw new Error("External QA must be explicitly enabled.");
await mkdir("screenshots", { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.platform === "win32" ? { channel: "msedge" } : {}),
});
const context = await browser.newContext({
  colorScheme: "light",
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(base + "/login");
  const select = page.getByLabel("Tema da interface");
  await select.waitFor({ timeout: 6000 });
  await select.selectOption("dark");
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  assert.equal(await page.evaluate(() => localStorage.getItem("quati.theme")), "dark");
  await page.screenshot({ path: "screenshots/theme-dark-login.png", animations: "disabled" });
  await page.reload();
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await page.waitForFunction(
    () => !document.querySelector('select[aria-label="Tema da interface"]')?.disabled,
  );
  assert.equal(await select.inputValue(), "dark");
  const second = await context.newPage();
  await second.goto(base + "/login");
  await select.selectOption("light");
  await second.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  await select.selectOption("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  await select.selectOption("dark");
  await page.emulateMedia({ colorScheme: "light" });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "screenshots/theme-dark-login-mobile.png",
    animations: "disabled",
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.THEME_QA_CRM === "1" && ["127.0.0.1", "localhost"].includes(host)) {
    const { TEST_ACCOUNTS, TEST_PASSWORD } = await import("./test-accounts.mjs");
    await page.goto(base + "/login");
    await page.getByLabel("Tema da interface").selectOption("dark");
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll("button")).find((b) =>
          b.textContent.includes("Continuar com Google"),
        )?.disabled,
    );
    await page
      .getByLabel("E-mail", { exact: true })
      .fill(TEST_ACCOUNTS.find((a) => a.role === "admin").email);
    await page.getByLabel("Senha", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Entrar com e-mail", exact: true }).click();
    await page.waitForURL("**/painel");
    for (const path of [
      "/painel",
      "/veiculos",
      "/moradores",
      "/chamados",
      "/reservas",
      "/financeiro",
      "/enquetes",
      "/entregas",
    ]) {
      await page.goto(base + path);
      await page.locator("#conteudo h1").waitFor();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
        path + " overflows on mobile",
      );
    }
    await page.goto(base + "/painel");
    await page.locator("#conteudo h1").waitFor();
    await page.screenshot({
      path: "screenshots/theme-dark-dashboard-mobile.png",
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: "screenshots/theme-dark-dashboard.png", animations: "disabled" });
    await page.goto(base + "/financeiro");
    await page.locator("#conteudo h1").waitFor();
    await page.screenshot({ path: "screenshots/theme-dark-finance.png", animations: "disabled" });
    await page.getByLabel("Tema da interface").selectOption("light");
    await page.screenshot({ path: "screenshots/theme-light-finance.png", animations: "disabled" });
  }
  const beforeHydration = await browser.newContext({ colorScheme: "light" });
  await beforeHydration.addInitScript(() => localStorage.setItem("quati.theme", "dark"));
  await beforeHydration.route("**/*", (route) =>
    route.request().resourceType() === "script" ? route.abort() : route.continue(),
  );
  const earlyPage = await beforeHydration.newPage();
  await earlyPage.goto(base + "/login", { waitUntil: "domcontentloaded" });
  assert.equal(
    await earlyPage.evaluate(() => document.documentElement.dataset.theme),
    "dark",
    "Saved theme must apply before client modules load",
  );
  const blocked = await browser.newContext({ colorScheme: "dark" });
  await blocked.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    }),
  );
  const blockedPage = await blocked.newPage();
  blockedPage.on("pageerror", (e) => errors.push(e.message));
  await blockedPage.goto(base + "/login");
  await blockedPage.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await blockedPage.getByLabel("Tema da interface").selectOption("light");
  await blockedPage.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      persistence: true,
      systemChanges: true,
      crossTab: true,
      storageBlocked: true,
      mobileOverflow: false,
      pageErrors: errors,
    }),
  );
} finally {
  await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 5000))]);
}
process.exit(0);

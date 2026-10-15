import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.argv[2] || 'http://127.0.0.1:8080';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage();
  const errors = [];
  let oauthRequests = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().includes('/api/auth/sign-in/oauth2')) oauthRequests++;
  });
  await page.route('https://auth.grok.me/**', route => route.abort());
  await page.goto(`${origin}/login`);
  await page.getByRole('button', { name: 'Continuar com Google', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'ainda não está configurado' }).waitFor({ timeout: 5000 });
  assert.equal(new URL(page.url()).pathname, '/login');
  assert.equal(oauthRequests, 0, 'Unconfigured social login must not start an OAuth request');
  await page.getByRole('button', { name: 'Continuar com X', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'ainda não está configurado' }).waitFor();
  assert.equal(oauthRequests, 0);
  assert.equal(await page.getByRole('button', { name: 'Entrar com e-mail', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: 'Ainda não tenho conta', exact: true }).click();
  await page.getByLabel('Nome completo').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Criar conta', exact: true }).isEnabled(), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ origin, result: 'pass', oauthRequests, errors }));
} finally {
  await browser.close();
}

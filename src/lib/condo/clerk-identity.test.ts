import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { verifyClerkIdentity } from "./clerk-identity.ts";

const issuer = "https://example.clerk.accounts.dev";
const origin = "https://quati.example";
const { privateKey, publicKey } = await generateKeyPair("RS256");
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "test" }] });
async function token(
  overrides: Record<string, unknown> = {},
  audience = "quati-crm",
  expires = "60s",
) {
  return new SignJWT({
    sub: "user_verified",
    sid: "sess_verified",
    azp: origin,
    quati_email: "Owner@Example.com",
    quati_email_verified: true,
    quati_name: "Morador",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setNotBefore("-5s")
    .setExpirationTime(expires)
    .sign(privateKey);
}

test("accepts a signed verified identity and normalizes its email", async () => {
  assert.deepEqual(await verifyClerkIdentity(await token(), { issuer, origin }, keys), {
    id: "user_verified",
    email: "owner@example.com",
    name: "Morador",
    emailVerified: true,
  });
});

test("rejects unverified emails, foreign origins, pending or missing sessions", async () => {
  for (const claims of [
    { quati_email_verified: false },
    { quati_email_verified: "true" },
    { azp: "https://foreign.example" },
    { azp: null },
    { sid: null },
    { sts: "pending" },
    { quati_email: null },
  ])
    await assert.rejects(verifyClerkIdentity(await token(claims), { issuer, origin }, keys));
});

test("rejects wrong issuers, audiences, expired tokens and forged signatures", async () => {
  const valid = await token();
  await assert.rejects(
    verifyClerkIdentity(valid, { issuer: "https://other.clerk.accounts.dev", origin }, keys),
  );
  await assert.rejects(verifyClerkIdentity(await token({}, "foreign"), { issuer, origin }, keys));
  await assert.rejects(
    verifyClerkIdentity(await token({}, "quati-crm", "-10s"), { issuer, origin }, keys),
  );
  const { publicKey: otherKey } = await generateKeyPair("RS256");
  const otherKeys = createLocalJWKSet({ keys: [{ ...(await exportJWK(otherKey)), kid: "test" }] });
  await assert.rejects(verifyClerkIdentity(valid, { issuer, origin }, otherKeys));
});

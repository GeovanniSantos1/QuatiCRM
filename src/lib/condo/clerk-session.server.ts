import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { createRemoteJWKSet } from "jose";
import { z } from "zod";
import { verifyClerkIdentity } from "./clerk-identity";

export const CLERK_PROVIDER_ID = "quati-clerk";

export function getClerkConfiguration() {
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY?.trim();
  if (!publishableKey || !/^pk_(test|live)_/.test(publishableKey)) return null;
  try {
    const host = Buffer.from(publishableKey.replace(/^pk_(test|live)_/, ""), "base64")
      .toString()
      .replace(/\$$/, "");
    const issuer = new URL(`https://${host}`);
    if (
      issuer.hostname !== host ||
      issuer.pathname !== "/" ||
      issuer.port ||
      issuer.username ||
      issuer.password
    )
      return null;
    return { publishableKey, issuer: issuer.origin };
  } catch {
    return null;
  }
}

/** Exchange a verified Clerk identity for the existing CRM session, preserving local user IDs. */
export function clerkIdentitySessions() {
  const config = getClerkConfiguration();
  const keys = config ? createRemoteJWKSet(new URL("/.well-known/jwks.json", config.issuer)) : null;
  return {
    id: CLERK_PROVIDER_ID,
    endpoints: {
      signInClerk: createAuthEndpoint(
        "/sign-in/clerk",
        {
          method: "POST",
          body: z.object({ token: z.string().min(1).max(16384) }),
        },
        async (ctx) => {
          if (!config || !keys || process.env.VITE_AUTH_ENABLED === "false")
            throw ctx.error("NOT_FOUND", { message: "Login com Google indisponível." });
          const inbound = ctx.request?.headers ?? ctx.headers;
          const origin = inbound?.get("origin");
          const allowedOrigins = process.env.BETTER_AUTH_URL?.trim()
            ? [new URL(process.env.BETTER_AUTH_URL).origin]
            : ["http://localhost:8080", "http://127.0.0.1:8080", "http://[::1]:8080"];
          if (
            !origin ||
            !allowedOrigins.includes(origin) ||
            ["cross-site", "same-site"].includes(inbound?.get("sec-fetch-site") ?? "")
          )
            throw ctx.error("FORBIDDEN", { message: "Origem não permitida." });
          let identity;
          try {
            identity = await verifyClerkIdentity(
              ctx.body.token,
              { issuer: config.issuer, origin },
              keys,
            );
          } catch {
            throw ctx.error("UNAUTHORIZED", {
              message: "Não foi possível validar o Google. Tente entrar novamente.",
            });
          }
          const result = await handleOAuthUserInfo(ctx, {
            userInfo: identity,
            account: { providerId: CLERK_PROVIDER_ID, accountId: identity.id },
          });
          if (result.error || !result.data)
            throw ctx.error("UNAUTHORIZED", { message: "Não foi possível concluir o acesso." });
          await setSessionCookie(ctx, result.data);
          return ctx.json({ success: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}

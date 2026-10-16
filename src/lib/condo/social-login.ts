import { createServerFn } from "@tanstack/react-start";

// Public capabilities only; no private credentials are returned to the browser.
export const getSocialLoginConfiguration = createServerFn({ method: "GET" }).handler(async () => {
  const { getClerkConfiguration } = await import("./clerk-session.server");
  return {
    clerkPublishableKey: getClerkConfiguration()?.publishableKey ?? null,
    appClientConfigured: Boolean(
      process.env.GROK_AUTH_CLIENT_ID &&
      process.env.GROK_AUTH_CLIENT_ID !== "grok_preview" &&
      process.env.GROK_AUTH_CLIENT_SECRET,
    ),
  };
});

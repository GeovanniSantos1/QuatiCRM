import { createServerFn } from "@tanstack/react-start";

// Public capability only: OAuth credentials remain on the server.
export const getSocialLoginConfiguration = createServerFn({ method: "GET" }).handler(async () => ({
  appClientConfigured: Boolean(
    process.env.GROK_AUTH_CLIENT_ID &&
      process.env.GROK_AUTH_CLIENT_ID !== "grok_preview" &&
      process.env.GROK_AUTH_CLIENT_SECRET,
  ),
}));

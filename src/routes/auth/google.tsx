import { ThemeSelector } from "@/components/theme-selector";
import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ClerkProvider,
  HandleSSOCallback,
  SignIn,
  SignUp,
  useAuth,
  useClerk,
  useSignIn,
} from "@clerk/react";
import { getSocialLoginConfiguration } from "@/lib/condo/social-login";
import { QuatiMark } from "@/components/quati-mark";

export const Route = createFileRoute("/auth/google")({
  component: GoogleLogin,
  loader: () => getSocialLoginConfiguration(),
  validateSearch: (search: Record<string, unknown>) => ({
    etapa: ["retorno", "concluir", "verificar", "cadastro"].includes(String(search.etapa))
      ? String(search.etapa)
      : "iniciar",
    convite:
      typeof search.convite === "string" && /^[a-f0-9]{64}$/.test(search.convite)
        ? search.convite
        : undefined,
  }),
});

const clerkAppearance = {
  elements: {
    rootBox: { width: "100%", minWidth: 0 },
    cardBox: { width: "100%", maxWidth: "100%", minWidth: 0 },
    card: { width: "100%", maxWidth: "100%", minWidth: 0 },
  },
  variables: {
    colorPrimary: "var(--color-pine)",
    colorPrimaryForeground: "var(--color-on-accent)",
    colorBackground: "var(--color-card)",
    colorForeground: "var(--color-ink)",
    colorInput: "var(--color-paper)",
    colorInputForeground: "var(--color-ink)",
    colorMuted: "var(--color-paper)",
    colorMutedForeground: "var(--color-muted)",
    colorBorder: "var(--color-line)",
    colorDanger: "var(--color-danger)",
    colorRing: "var(--color-pine)",
    fontFamily: "var(--font-sans)",
  },
};

function GoogleLogin() {
  const { clerkPublishableKey } = Route.useLoaderData();
  return (
    <main className="grid min-h-screen place-items-center bg-paper p-5">
      <section className="min-w-0 w-full max-w-md rounded-3xl border border-line bg-card p-6 sm:p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center gap-3 font-display text-2xl text-pine"
          >
            <QuatiMark className="size-10" /> quati.
          </Link>
          <ThemeSelector compact />
        </div>
        <h1 className="font-display text-2xl">Entrar com Google</h1>
        <p className="mt-2 mb-6 text-sm text-muted">
          Acesse sua conta para continuar no condomínio.
        </p>
        {clerkPublishableKey ? (
          <ClerkProvider publishableKey={clerkPublishableKey} appearance={clerkAppearance}>
            <GoogleFlow />
          </ClerkProvider>
        ) : (
          <p role="alert" className="text-sm text-danger">
            O login com Google ainda não está disponível.
          </p>
        )}
        <Link
          to="/login"
          className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-pine"
        >
          Voltar para o login
        </Link>
      </section>
    </main>
  );
}

function GoogleFlow() {
  const { etapa, convite } = Route.useSearch();
  const clerk = useClerk();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signIn } = useSignIn();
  const started = useRef(false);
  const [error, setError] = useState("");
  const suffix = convite ? `&convite=${convite}` : "";
  const route = (step: string) => `/auth/google?etapa=${step}${suffix}`;

  useEffect(() => {
    if (!isLoaded || started.current || ["retorno", "verificar", "cadastro"].includes(etapa))
      return;
    started.current = true;
    void (async () => {
      if (isSignedIn) {
        const token = await getToken({ skipCache: true });
        if (!token) throw new Error("Sessão do Google expirada. Tente novamente.");
        const response = await fetch("/api/auth/sign-in/clerk", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message || "Não foi possível concluir o acesso.");
        }
        // The CRM owns the resulting session. End the temporary identity-provider session
        // so a subsequent Google login can choose a different account.
        await clerk.signOut({ redirectUrl: convite ? `/convite/${convite}` : "/painel" });
      } else {
        const result = await signIn.sso({
          strategy: "oauth_google",
          redirectUrl: new URL(route("concluir"), window.location.origin).href,
          redirectCallbackUrl: new URL(route("retorno"), window.location.origin).href,
        });
        if (result.error)
          throw new Error(result.error.message || "Não foi possível abrir o Google.");
      }
    })().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : "Não foi possível entrar com Google."),
    );
  }, [isLoaded, isSignedIn, getToken, signIn, clerk, etapa, convite]);

  if (error)
    return (
      <div role="alert">
        <p className="text-sm text-danger">{error}</p>
        <a
          href={route("iniciar")}
          className="mt-3 inline-flex min-h-11 items-center font-semibold text-pine"
        >
          Tentar novamente
        </a>
      </div>
    );
  if (etapa === "retorno")
    return (
      <HandleSSOCallback
        navigateToApp={() => {
          window.location.assign(route("concluir"));
        }}
        navigateToSignIn={() => {
          window.location.assign(route("verificar"));
        }}
        navigateToSignUp={() => {
          window.location.assign(route("cadastro"));
        }}
      />
    );
  if (etapa === "verificar")
    return (
      <SignIn
        routing="hash"
        forceRedirectUrl={route("concluir")}
        signUpForceRedirectUrl={route("concluir")}
      />
    );
  if (etapa === "cadastro")
    return (
      <SignUp
        routing="hash"
        forceRedirectUrl={route("concluir")}
        signInForceRedirectUrl={route("concluir")}
      />
    );
  return (
    <p role="status" className="text-sm text-muted">
      {isSignedIn ? "Concluindo seu acesso…" : "Conectando ao Google…"}
    </p>
  );
}

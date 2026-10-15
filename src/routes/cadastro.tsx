import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
export const Route = createFileRoute("/cadastro")({
  component: () => (
    <AppShell>
      <Navigate to="/painel" />
    </AppShell>
  ),
});

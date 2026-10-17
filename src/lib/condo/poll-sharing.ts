const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function pollIdFromSearch(value: unknown): string | undefined {
  return typeof value === "string" && UUID.test(value) ? value : undefined;
}
type LoginContext = { convite?: string; enquete?: string };
function invitation(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}
export function loginDestination(context: LoginContext): string {
  const invite = invitation(context.convite);
  const poll = pollIdFromSearch(context.enquete);
  return invite ? `/convite/${invite}` : poll ? `/enquetes/${poll}` : "/painel";
}
export function loginContextQuery(context: LoginContext): string {
  const invite = invitation(context.convite);
  const poll = pollIdFromSearch(context.enquete);
  return invite ? `convite=${invite}` : poll ? `enquete=${poll}` : "";
}
export function pollShare({ id, title, origin }: { id: string; title: string; origin: string }) {
  if (!pollIdFromSearch(id)) throw new Error("Enquete inválida.");
  const base = new URL(origin);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password)
    throw new Error("Endereço inválido.");
  const url = `${base.origin}/login?enquete=${id}`;
  const message = `Condomínio Quati · Nova enquete\n\n${title}\n\nParticipe pelo link: ${url}\n\nEntre com sua própria conta. Cada unidade pode votar uma vez.`;
  return { url, message, whatsappUrl: `https://wa.me/?text=${encodeURIComponent(message)}` };
}

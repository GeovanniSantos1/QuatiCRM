import { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { btnClay, btnGhost, field } from "./app-shell";
import type { pollShare } from "@/lib/condo/poll-sharing";

export function PollShareActions({ share }: { share: ReturnType<typeof pollShare> }) {
  const [feedback, setFeedback] = useState("");
  return (
    <section
      aria-label="Compartilhar enquete"
      className="space-y-3 rounded-2xl border border-line bg-moss p-4"
    >
      <h2 className="font-display text-xl">Convide todos a participar</h2>
      <p className="text-sm text-muted">
        Escolha um grupo ou os contatos no WhatsApp e confirme o envio. Cada morador acessa com sua
        própria conta.
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={share.whatsappUrl} target="_blank" rel="noopener noreferrer" className={btnClay}>
          <Share2 className="size-4" aria-hidden="true" /> Compartilhar com todos no WhatsApp
        </a>
        <button
          type="button"
          className={btnGhost}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(share.url);
              setFeedback("Link copiado.");
            } catch {
              setFeedback("Selecione e copie o link abaixo.");
            }
          }}
        >
          <Copy className="size-4" aria-hidden="true" /> Copiar link
        </button>
      </div>
      <label className="block text-sm">
        Link da enquete
        <input
          readOnly
          value={share.url}
          className={`${field} mt-1 bg-card`}
          onFocus={(e) => e.currentTarget.select()}
        />
      </label>
      {feedback && (
        <p role="status" className="text-sm text-pine">
          {feedback}
        </p>
      )}
    </section>
  );
}

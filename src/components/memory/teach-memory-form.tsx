"use client";

import { useActionState } from "react";
import { Brain, Loader2 } from "lucide-react";
import {
  ensinarPreferenciasAction,
  type TeachMemoryState,
} from "@/app/dashboard/configuracoes/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const INITIAL: TeachMemoryState = { ok: null, message: "" };

/** Texto livre → Agente de Memória (Gemini) → preferências tipadas no Supabase. */
export function TeachMemoryForm() {
  const [state, formAction, pending] = useActionState(ensinarPreferenciasAction, INITIAL);

  return (
    <form action={formAction} className="space-y-3">
      <label htmlFor="mensagem" className="block text-sm font-medium text-muted">
        Conte para a IA o que a dupla prefere
      </label>
      <textarea
        id="mensagem"
        name="mensagem"
        rows={3}
        maxLength={600}
        required
        placeholder="Ex.: Odiamos escalas longas, no máximo 1 escala. Hotel até R$ 2.500 a viagem toda, nota 8 pra cima. Amamos gastronomia e trilhas."
        className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-sm text-heading placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/40"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          aria-live="polite"
          className={cn(
            "text-sm",
            state.ok === false ? "text-danger" : "text-foreground"
          )}
        >
          {state.message}
        </p>
        <Button type="submit" variant="primary" disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
          {pending ? "Memorizando…" : "Ensinar à IA"}
        </Button>
      </div>
    </form>
  );
}

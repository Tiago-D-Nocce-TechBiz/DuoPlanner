"use client";

import { useActionState } from "react";
import { X } from "@/components/ui/icons";
import { esquecerPreferenciaAction } from "@/app/dashboard/configuracoes/actions";

/**
 * Botão "esquecer" de uma preferência. Formulário com Server Action: funciona
 * antes mesmo do JavaScript carregar; com ele, mostra o erro se a remoção
 * falhar (antes a falha era silenciosa).
 */
export function EsquecerPreferencia({ chave, descricao }: { chave: string; descricao: string }) {
  const [estado, formAction, pendente] = useActionState(esquecerPreferenciaAction, null);
  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="chave" value={chave} />
      <button
        type="submit"
        disabled={pendente}
        aria-label={`Esquecer: ${descricao}`}
        className="rounded-full p-1 text-subtle transition-colors hover:bg-elevated hover:text-heading disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {estado && !estado.success && (
        <span role="alert" className="pr-2 text-xs text-danger">
          {estado.error}
        </span>
      )}
    </form>
  );
}

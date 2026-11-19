"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Loader2, Sparkles, Upload } from "@/components/ui/icons";
import { useContextoSync } from "@/lib/sync/motor";
import { adicionarDia } from "./roteiro-acoes";

/**
 * Botões do cabeçalho do Roteiro. Ilha cliente leve: o diálogo de importação
 * (parser, organização, prévia) e o `xlsx` só baixam quando a pessoa clica; o
 * modelo da planilha idem (`import()` dentro do clique).
 */
const ImportarPlanilha = dynamic(() => import("./importar-planilha").then((m) => m.ImportarPlanilha), {
  ssr: false,
  loading: () => null,
});

const BOTAO = "px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-60";

export function AcoesDoRoteiro() {
  const ctx = useContextoSync();
  const ws = ctx?.workspace?.id ?? null;
  const userId = ctx?.userId ?? null;
  const [importando, setImportando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [erroDoModelo, setErroDoModelo] = useState<string | null>(null);

  async function baixarModelo() {
    setBaixando(true);
    setErroDoModelo(null);
    try {
      const { baixarPlanilhaModelo } = await import("@/lib/roteiro/template-generator");
      await baixarPlanilhaModelo();
    } catch {
      setErroDoModelo("Não consegui gerar a planilha agora. Verifique a conexão e tente de novo.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={baixarModelo}
          disabled={baixando}
          className={`${BOTAO} glass-panel text-[var(--color-heading)] hover:bg-black/5 dark:hover:bg-white/10`}
        >
          {baixando ? <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 inline h-3.5 w-3.5 rotate-180" />}
          Baixar Planilha Modelo
        </button>
        <button
          type="button"
          onClick={() => setImportando(true)}
          disabled={!ws}
          className={`${BOTAO} glass-panel text-[var(--color-heading)] hover:bg-black/5 dark:hover:bg-white/10`}
        >
          <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-blue-500" />
          Importar Planilha com a Nora
        </button>
        <button
          type="button"
          onClick={() => userId && ws && adicionarDia(userId, ws)}
          disabled={!ws}
          className={`${BOTAO} bg-[var(--color-accent)] text-[var(--color-accent-foreground)]`}
        >
          + Adicionar dia
        </button>
      </div>
      {erroDoModelo && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {erroDoModelo}
        </p>
      )}
      {importando && <ImportarPlanilha aoFechar={() => setImportando(false)} />}
    </div>
  );
}

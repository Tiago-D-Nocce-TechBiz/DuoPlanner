"use client";

import { useMemo, useState, useTransition } from "react";
import { Database } from "@/components/ui/icons";
import { useMontado } from "@/lib/local-store";
import { contarDadosLegados, lerDadosLegados, totalLegado } from "@/lib/sync/legado";
import { descartarDadosLegados, importarDadosLegados } from "@/lib/sync/importar-legado";
import { useContextoSync } from "@/lib/sync/motor";

/**
 * Aviso de dados antigos no navegador (salvos antes da sincronização).
 *
 * Nunca importamos sozinhos: num navegador compartilhado, esses dados podem
 * ser de outra pessoa. A conta logada escolhe importar ou descartar.
 */
export function BannerImportacao() {
  const montado = useMontado();
  const contexto = useContextoSync();
  const [resolvido, setResolvido] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [importando, startImportacao] = useTransition();

  const contagem = useMemo(() => {
    if (!montado || resolvido) return null;
    const dados = lerDadosLegados(window.localStorage);
    return totalLegado(dados) > 0 ? contarDadosLegados(dados) : null;
  }, [montado, resolvido]);

  if (mensagem) {
    return (
      <div role="status" className="mb-6 glass-panel rounded-2xl px-4 py-3 text-xs text-[var(--color-heading)] flex items-center justify-between gap-3">
        <span>{mensagem}</span>
        <button type="button" onClick={() => setMensagem(null)} className="font-semibold underline underline-offset-2 cursor-pointer">
          Ok
        </button>
      </div>
    );
  }
  if (!contagem || !contexto) return null;

  const partes = [
    contagem.despesas && `${contagem.despesas} gasto(s)`,
    contagem.roteiro && `${contagem.roteiro} item(ns) do roteiro`,
    contagem.checklist && `${contagem.checklist} do checklist`,
    contagem.documentos && `${contagem.documentos} documento(s)`,
    contagem.alertas && `${contagem.alertas} alerta(s)`,
  ].filter(Boolean);

  function importar() {
    startImportacao(async () => {
      try {
        const r = await importarDadosLegados();
        setResolvido(true);
        const extra = [
          r.descartados ? `${r.descartados} item(ns) com dados incompletos ficaram de fora` : "",
          r.aviso ?? "",
        ].filter(Boolean);
        setMensagem(
          `Pronto: ${r.importados + r.documentos} item(ns) enviados para a sua conta.${extra.length ? ` ${extra.join(". ")}.` : ""}`
        );
      } catch (e) {
        setMensagem(e instanceof Error ? e.message : "Não foi possível importar agora.");
      }
    });
  }

  function descartar() {
    descartarDadosLegados();
    setResolvido(true);
    setMensagem("Os dados antigos deste navegador foram apagados.");
  }

  return (
    <div className="mb-6 glass-panel rounded-2xl p-4 sm:p-5 ring-1 ring-[var(--color-border-strong)]">
      <div className="flex items-start gap-3">
        <Database className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-heading)]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--color-heading)]">
            Encontramos dados salvos só neste navegador
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {partes.join(", ")}, de antes da sincronização. Se são seus, importe para a sua conta: eles passam a
            aparecer nos seus aparelhos (e no do seu par, quando forem da viagem). Num navegador compartilhado,
            podem ser de outra pessoa.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={importar}
              disabled={importando}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
            >
              {importando ? "Importando…" : "Importar para a minha conta"}
            </button>
            <button
              type="button"
              onClick={descartar}
              disabled={importando}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold glass-panel cursor-pointer"
            >
              Não são meus: descartar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

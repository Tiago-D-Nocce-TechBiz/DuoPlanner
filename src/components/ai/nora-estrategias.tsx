"use client";

import { useEffect, useRef } from "react";
import { filtrarComandos, type Estrategia, type EstrategiaId } from "@/lib/ai/nora-strategies";
import { cn } from "@/lib/utils";
import { ICONES_DA_NORA } from "./nora-icones";

/**
 * Atalhos das 9 ferramentas da Nora na gaveta: carrossel de chips acima da
 * caixa de pergunta e menu de comandos que abre ao digitar "/".
 * Só catálogo e ícones: nada de zod nem LangChain no navegador.
 */

export function CarrosselDeAtalhos({
  estrategias,
  desativado,
  onEscolher,
}: {
  estrategias: readonly Estrategia[];
  desativado: boolean;
  onEscolher: (id: EstrategiaId) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Ferramentas de economia de viagem da Nora"
      data-nora-atalhos
      className="mb-2 flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
    >
      {estrategias.map((e) => {
        const Icone = ICONES_DA_NORA[e.iconName];
        return (
          <button
            key={e.id}
            type="button"
            disabled={desativado}
            title={e.shortDescription}
            onClick={() => onEscolher(e.id)}
            className="inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-background px-3 py-1.5 text-xs font-medium whitespace-nowrap text-[var(--color-heading)] transition-colors hover:border-blue-400/50 hover:bg-black/[0.03] disabled:opacity-50 dark:hover:bg-white/[0.04]"
          >
            <Icone className="h-3.5 w-3.5 text-blue-500" />
            {e.label}
          </button>
        );
      })}
    </div>
  );
}

export function MenuDeComandos({
  consulta,
  indiceAtivo,
  onEscolher,
  onPassar,
}: {
  consulta: string;
  indiceAtivo: number;
  onEscolher: (e: Estrategia) => void;
  onPassar: (indice: number) => void;
}) {
  const lista = filtrarComandos(consulta);
  const ativoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ativoRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [indiceAtivo]);

  if (lista.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label="Comandos da Nora"
      data-nora-comandos
      className="mb-2 max-h-56 overflow-y-auto rounded-xl border border-blue-400/30 bg-background p-1.5 shadow-lg"
    >
      {lista.map((e, i) => {
        const Icone = ICONES_DA_NORA[e.iconName];
        const ativo = i === indiceAtivo;
        return (
          <button
            key={e.id}
            ref={ativo ? ativoRef : undefined}
            type="button"
            role="option"
            aria-selected={ativo}
            onMouseEnter={() => onPassar(i)}
            // mouseDown (e não click) mantém o foco na caixa de texto.
            onMouseDown={(ev) => {
              ev.preventDefault();
              onEscolher(e);
            }}
            className={cn(
              "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left",
              ativo ? "bg-black/5 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/10"
            )}
          >
            <Icone className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[var(--color-heading)]">{e.slashCommand}</span>
              <span className="block text-xs text-[var(--color-muted)]">{e.shortDescription}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

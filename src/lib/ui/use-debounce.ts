"use client";

import { startTransition, useEffect, useState } from "react";

/** Atraso padrão para campos de busca: some entre teclas e chega antes de a pessoa sentir espera. */
export const ATRASO_BUSCA_MS = 300;

/**
 * O valor, mas só depois de `atrasoMs` sem mudar (a pessoa parou de digitar).
 * O campo continua respondendo a cada tecla; o trabalho caro (filtrar e
 * redesenhar uma lista longa) roda uma vez por pausa, não por tecla.
 *
 * A atualização atrasada entra como transição: se a pessoa voltar a digitar
 * enquanto a lista é redesenhada, a tecla tem prioridade e o redesenho é
 * interrompido (nada de tecla presa atrás de uma tarefa longa).
 *
 * Valor vazio não espera o atraso (limpar a busca mostra tudo já), mas
 * também vai como transição: a tecla que apagou pinta primeiro e a lista
 * inteira volta logo depois, sem travar o campo.
 */
export function useDebounce<T>(valor: T, atrasoMs: number = ATRASO_BUSCA_MS): T {
  const [atrasado, setAtrasado] = useState(valor);
  const vazio = valor === "" || valor === null || valor === undefined;

  useEffect(() => {
    const relogio = setTimeout(() => startTransition(() => setAtrasado(valor)), vazio ? 0 : atrasoMs);
    return () => clearTimeout(relogio);
  }, [valor, atrasoMs, vazio]);

  return atrasado;
}

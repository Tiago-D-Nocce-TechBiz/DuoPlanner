import type { RoteiroDia, RoteiroItem } from "@/lib/sync/modelos";
import { CATEGORIAS_ROTEIRO, type FiltroRoteiro } from "./tipos";

/** Regras de exibição do Roteiro (puras, testáveis sem tela). */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatarReais = (v: number) => brl.format(v);

/** "qua., 10/09/2026"; sem data, "Dia sem data". */
export function formatarDataDoDia(iso: string | null): string {
  if (!iso) return "Dia sem data";
  const [y, m, d] = iso.split("-");
  const semana = new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" });
  return `${semana} ${d}/${m}/${y}`;
}

/** Dias com data em ordem cronológica (empate pela ordem do roteiro); dias sem data depois, pela ordem. */
export function ordenarDias<T extends Pick<RoteiroDia, "data" | "ordem">>(dias: readonly T[]): T[] {
  return [...dias].sort((a, b) => {
    if (a.data !== b.data) {
      if (a.data === null) return 1;
      if (b.data === null) return -1;
      return a.data < b.data ? -1 : 1;
    }
    return a.ordem - b.ordem;
  });
}

/** A atividade entra no filtro? "Todos" mostra tudo, inclusive as sem categoria. */
export function passaNoFiltro(item: Pick<RoteiroItem, "categoria">, filtro: FiltroRoteiro): boolean {
  return filtro === "Todos" || item.categoria === filtro;
}

/** Custo estimado do dia: soma das atividades com estimativa (em centavos inteiros, sem erro de ponto flutuante). */
export function custoEstimadoDoDia(itens: readonly Pick<RoteiroItem, "custoEstimado">[]): number {
  const centavos = itens.reduce((soma, i) => soma + Math.round((i.custoEstimado ?? 0) * 100), 0);
  return centavos / 100;
}

/** Categoria do item entre as conhecidas; as desconhecidas aparecem como "Outros". */
export function categoriaDoItem(item: Pick<RoteiroItem, "categoria">): string {
  const c = item.categoria;
  if (!c) return "";
  return (CATEGORIAS_ROTEIRO as readonly string[]).includes(c) ? c : "Outros";
}

/** Texto digitado no campo de custo → número válido (0 a 1.000.000) ou null para vazio; `undefined` se ainda não é número. */
export function lerCustoDigitado(texto: string): number | null | undefined {
  const t = texto.trim().replace(/^R\$\s*/i, "");
  if (t === "") return null;
  if (!/^\d+([.,]\d{0,2})?$/.test(t)) return undefined;
  const n = Number(t.replace(",", "."));
  return n >= 0 && n <= 1_000_000 ? n : undefined;
}

import { addDays, dateInSaoPaulo } from "@/lib/dates";
import { regraDoAcordo, type AcordoDivisao } from "@/lib/sync/contexto";
import type { Despesa } from "@/lib/sync/modelos";
import { calcularAcerto, descreverRegra, valorEmReais, type LancamentoAcerto, type Papel } from "./acerto";

/**
 * Resumo Semanal do Orçamento (puro, testável).
 *
 * Calculado no servidor com a chave secreta, ou seja, SEM a RLS. Por isso as
 * regras de visibilidade ficam aqui, e não na consulta:
 *  - gastos da viagem: só os COMPARTILHADOS do espaço do destinatário;
 *  - "só seus": só os PRIVADOS do próprio destinatário (o privado do par
 *    nunca entra, mesmo que chegue na lista);
 *  - acerto de contas: todos os lançamentos compartilhados do espaço (a
 *    viagem inteira, não só a semana), com a regra combinada pelo casal.
 */

export interface PeriodoSemana {
  /** Segunda-feira, AAAA-MM-DD. */
  inicio: string;
  /** Domingo, AAAA-MM-DD. */
  fim: string;
}

/** Segunda-feira da semana (de segunda a domingo) que contém `hojeIso`. */
export function segundaDaSemana(hojeIso: string): string {
  const diaDaSemana = new Date(`${hojeIso}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(hojeIso, -((diaDaSemana + 6) % 7));
}

/** A semana completa anterior à de `hojeIso`. */
export function semanaAnterior(hojeIso: string): PeriodoSemana {
  const segunda = segundaDaSemana(hojeIso);
  return { inicio: addDays(segunda, -7), fim: addDays(segunda, -1) };
}

/** O resumo desta semana já foi processado (evita reenviar ao rodar de novo). */
export function resumoJaProcessado(processadoEm: string | null, hojeIso: string): boolean {
  if (!processadoEm) return false;
  const dia = dateInSaoPaulo(processadoEm);
  return dia !== "" && dia >= segundaDaSemana(hojeIso);
}

export interface MembroResumo {
  userId: string;
  nome: string;
  papel: Papel;
}

export interface EntradaResumo {
  /** Destinatário. */
  userId: string;
  workspaceId: string | null;
  membros: MembroResumo[];
  acordo: AcordoDivisao;
  /** Pode conter linhas de outras pessoas e espaços: o filtro é feito aqui. */
  despesas: Despesa[];
  periodo: PeriodoSemana;
}

export interface ResumoSemanal {
  totalCompartilhado: number;
  qtdCompartilhado: number;
  porCategoria: { categoria: string; total: number }[];
  totalPrivado: number;
  qtdPrivado: number;
  semCotacao: number;
  acerto: { situacao: "quites" | "receber" | "pagar"; valor: number; nomePar: string; regra: string } | null;
  /** Nada a contar: sem gastos na semana e sem saldo em aberto. */
  vazio: boolean;
}

const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;
const CATEGORIA_PESSOAL = "Gasto Pessoal (Fora da Viagem)";

export function montarResumoSemanal(e: EntradaResumo): ResumoSemanal {
  const naSemana = (d: Despesa) => d.data >= e.periodo.inicio && d.data <= e.periodo.fim;
  const doEspaco = (d: Despesa) =>
    e.workspaceId !== null && d.workspaceId === e.workspaceId && d.escopo === "viagem_compartilhado";
  const meuPrivado = (d: Despesa) => d.escopo === "pessoal_privado" && d.userId === e.userId;

  const semCotacao = new Set<string>();
  const emCentavos = (d: Despesa): number | null => {
    const v = valorEmReais(d);
    if (v === null) {
      semCotacao.add(d.id);
      return null;
    }
    return centavos(v);
  };

  let totalCompartilhado = 0;
  let qtdCompartilhado = 0;
  const porCategoria = new Map<string, number>();
  let totalPrivado = 0;
  let qtdPrivado = 0;

  for (const d of e.despesas) {
    if (d.tipo !== "gasto" || !naSemana(d)) continue;
    if (doEspaco(d)) {
      const v = emCentavos(d);
      if (v === null) continue;
      totalCompartilhado += v;
      qtdCompartilhado++;
      const rotulo = d.categoria === CATEGORIA_PESSOAL ? "Outros da viagem" : d.categoria;
      porCategoria.set(rotulo, (porCategoria.get(rotulo) ?? 0) + v);
    } else if (meuPrivado(d)) {
      const v = emCentavos(d);
      if (v === null) continue;
      totalPrivado += v;
      qtdPrivado++;
    }
  }

  let acerto: ResumoSemanal["acerto"] = null;
  const dono = e.membros.find((m) => m.papel === "dono");
  const parceiro = e.membros.find((m) => m.papel === "parceiro");
  const souDoCasal = dono?.userId === e.userId || parceiro?.userId === e.userId;
  if (dono && parceiro && souDoCasal && e.workspaceId) {
    const lancamentos: LancamentoAcerto[] = [];
    for (const d of e.despesas) {
      if (!doEspaco(d)) continue;
      const v = emCentavos(d);
      if (v === null) continue;
      lancamentos.push({ valorBrl: reais(v), pagoPor: d.pagoPor ?? d.userId, proporcaoDivisao: d.proporcaoDivisao, tipo: d.tipo });
    }
    const regra = regraDoAcordo(e.acordo);
    const r = calcularAcerto(lancamentos, { dono: dono.userId, parceiro: parceiro.userId }, regra);
    const meuPapel: Papel = dono.userId === e.userId ? "dono" : "parceiro";
    const par = meuPapel === "dono" ? parceiro : dono;
    acerto = {
      situacao: !r.devedor || r.valorAcerto === 0 ? "quites" : r.devedor === meuPapel ? "pagar" : "receber",
      valor: r.valorAcerto,
      nomePar: par.nome,
      regra: descreverRegra(regra, { dono: dono.nome, parceiro: parceiro.nome }),
    };
  }

  return {
    totalCompartilhado: reais(totalCompartilhado),
    qtdCompartilhado,
    porCategoria: [...porCategoria.entries()]
      .map(([categoria, total]) => ({ categoria, total: reais(total) }))
      .sort((a, b) => b.total - a.total),
    totalPrivado: reais(totalPrivado),
    qtdPrivado,
    semCotacao: semCotacao.size,
    acerto,
    vazio: qtdCompartilhado === 0 && qtdPrivado === 0 && (!acerto || acerto.situacao === "quites"),
  };
}

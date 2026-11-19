import type { RoteiroDia, RoteiroItem } from "@/lib/sync/modelos";
import { turnoDoHorario } from "./planilha";
import { fingerprintDaLinha, fingerprintDaSugestao, normalizarParaComparar } from "./fingerprint-roteiro";
import {
  LIMITES_ROTEIRO,
  SEPARADOR_DE_DESTINOS,
  type CategoriaRoteiro,
  type EntradaCuradoria,
  type LinhaPlanilha,
  type ResultadoCuradoria,
  type TurnoRoteiro,
} from "./tipos";

/**
 * Organização determinística da planilha: agrupa por dia, ordena por turno e
 * horário, reconhece o que já está no roteiro e monta as gravações. É o
 * caminho que roda SEM IA (sem chave, sem cota, sem conexão) e também a base
 * em cima da qual a curadoria da Nora entra. Puro: sem rede, sem relógio.
 */

export interface ItemPrevisto {
  /** Impressão digital: identifica o item na seleção e no banco. */
  chave: string;
  origem: "planilha" | "nora_sugestao";
  titulo: string;
  nota: string;
  /** HH:MM ou "". */
  horario: string;
  turno: TurnoRoteiro | null;
  categoria: CategoriaRoteiro;
  /** A categoria foi escrita na planilha ou reconhecida pelo texto (a Nora não a reclassifica). */
  categoriaCerta: boolean;
  /** Em reais. */
  custo: number | null;
  /** Linha da planilha (1 = cabeçalho); null nas sugestões. */
  linha: number | null;
  /** O texto de "por que" da sugestão da Nora. */
  porque: string | null;
  /** Já está no roteiro (mesma impressão digital ou mesmo título no mesmo dia). */
  jaNoRoteiro: boolean;
}

export interface DiaPrevisto {
  chave: string;
  data: string | null;
  /** Destinos das linhas do dia (ex.: "Lisboa" ou "Lisboa · Sintra"). */
  destino: string;
  /** Dia que já existe no roteiro e recebe estas atividades; null = dia novo. */
  diaExistenteId: string | null;
  itens: ItemPrevisto[];
  sugestoes: ItemPrevisto[];
}

export interface Previsao {
  dias: DiaPrevisto[];
  /** Linhas idênticas (mesmo destino, data e atividade) que a planilha repetia. */
  repetidasNoArquivo: number;
}

export interface Existentes {
  dias: readonly RoteiroDia[];
  itens: readonly RoteiroItem[];
}

/* ----------------------------------- ordem ---------------------------------- */

const BASE_DO_TURNO: Record<TurnoRoteiro, number> = { manha: 9 * 60, tarde: 14 * 60, noite: 20 * 60 };

/** Minutos para ordenar: horário exato, senão o meio do turno, senão o fim do dia. */
export function chaveDeOrdem(horario: string, turno: TurnoRoteiro | null): number {
  if (horario) return Number(horario.slice(0, 2)) * 60 + Number(horario.slice(3, 5));
  return turno ? BASE_DO_TURNO[turno] : 24 * 60;
}

const porOrdem = (a: ItemPrevisto, b: ItemPrevisto) => chaveDeOrdem(a.horario, a.turno) - chaveDeOrdem(b.horario, b.turno);

/** Datas em ordem; dias sem data por último. */
function porData(a: { data: string | null }, b: { data: string | null }): number {
  if (a.data === b.data) return 0;
  if (a.data === null) return 1;
  if (b.data === null) return -1;
  return a.data < b.data ? -1 : 1;
}

/* ------------------------------- dia existente ------------------------------ */

/**
 * O dia do roteiro que recebe as atividades: o de mesma data; para dias sem
 * data, o sem data de mesmo destino. Se não houver, o dia é novo.
 */
export function acharDiaExistente(dias: readonly RoteiroDia[], data: string | null, destino: string): RoteiroDia | null {
  const ordenados = [...dias].sort((a, b) => a.ordem - b.ordem);
  if (data) return ordenados.find((d) => d.data === data) ?? null;
  const alvo = normalizarParaComparar(destino);
  if (!alvo) return null;
  return ordenados.find((d) => d.data === null && normalizarParaComparar(d.destino ?? "") === alvo) ?? null;
}

function juntarDestinos(destinos: readonly string[]): string {
  const vistos = new Set<string>();
  const unicos: string[] = [];
  for (const d of destinos) {
    const k = normalizarParaComparar(d);
    if (k && !vistos.has(k)) {
      vistos.add(k);
      unicos.push(d);
    }
  }
  const junto = unicos.join(SEPARADOR_DE_DESTINOS);
  return junto.length <= LIMITES_ROTEIRO.destino ? junto : `${junto.slice(0, LIMITES_ROTEIRO.destino - 1).trimEnd()}…`;
}

/* -------------------------------- organização ------------------------------- */

export function organizarPlanilha(linhas: readonly LinhaPlanilha[], existentes: Existentes): Previsao {
  const fingerprintsExistentes = new Set(existentes.itens.map((i) => i.fingerprint).filter((f): f is string => !!f));
  const grupos = new Map<string, { data: string | null; destinos: string[]; itens: ItemPrevisto[] }>();
  const vistas = new Set<string>();
  let repetidas = 0;

  for (const l of linhas) {
    const chave = fingerprintDaLinha(l);
    if (vistas.has(chave)) {
      repetidas++;
      continue;
    }
    vistas.add(chave);
    const chaveDia = l.data ?? `sem-data|${normalizarParaComparar(l.destino)}`;
    const grupo = grupos.get(chaveDia) ?? { data: l.data, destinos: [], itens: [] };
    grupo.destinos.push(l.destino);
    grupo.itens.push({
      chave,
      origem: "planilha",
      titulo: l.atividade,
      nota: l.observacoes,
      horario: l.horario ?? "",
      turno: l.turno ?? (l.horario ? turnoDoHorario(l.horario) : null),
      categoria: l.categoria,
      categoriaCerta: l.categoriaCerta,
      custo: l.custo,
      linha: l.linha,
      porque: null,
      jaNoRoteiro: fingerprintsExistentes.has(chave),
    });
    grupos.set(chaveDia, grupo);
  }

  const dias: DiaPrevisto[] = [...grupos.entries()]
    .map(([chave, g]) => {
      const destino = juntarDestinos(g.destinos);
      const existente = acharDiaExistente(existentes.dias, g.data, destino);
      const titulosDoDia = new Set(
        existente ? existentes.itens.filter((i) => i.diaId === existente.id).map((i) => normalizarParaComparar(i.titulo)) : []
      );
      const itens = g.itens
        .map((i) => ({ ...i, jaNoRoteiro: i.jaNoRoteiro || titulosDoDia.has(normalizarParaComparar(i.titulo)) }))
        .sort(porOrdem);
      return { chave, data: g.data, destino, diaExistenteId: existente?.id ?? null, itens, sugestoes: [] };
    })
    .sort(porData);
  return { dias, repetidasNoArquivo: repetidas };
}

/* --------------------------------- curadoria -------------------------------- */

/** O pedido de curadoria: dias e atividades da prévia, com o que a Nora precisa classificar. */
export function montarEntradaCuradoria(previsao: Previsao, incluirSugestoes: boolean): EntradaCuradoria {
  return {
    incluirSugestoes,
    dias: previsao.dias.map((d, i) => ({ numero: i + 1, data: d.data, destino: d.destino })),
    linhas: previsao.dias.flatMap((d, i) =>
      d.itens.flatMap((it) =>
        it.linha === null
          ? []
          : [{ linha: it.linha, dia: i + 1, destino: d.destino, data: d.data, atividade: it.titulo, categoria: it.categoria, classificar: !it.categoriaCerta }]
      )
    ),
  };
}

/** Linhas cuja categoria a planilha não deixou clara: é o que se pede à Nora classificar. */
export function linhasParaClassificar(linhas: readonly LinhaPlanilha[]): LinhaPlanilha[] {
  return linhas.filter((l) => !l.categoriaCerta);
}

/**
 * Junta o que a Nora devolveu à prévia: classificações entram só onde a
 * planilha não tinha categoria (nunca sobrescrevem o que a pessoa escreveu) e
 * cada sugestão vai para um dia do destino, sem repetir o que já está na
 * planilha ou no roteiro.
 */
export function aplicarCuradoria(previsao: Previsao, curadoria: ResultadoCuradoria, existentes: Existentes): Previsao {
  const porLinha = new Map(curadoria.classificacoes.map((c) => [c.linha, c]));
  const fingerprintsExistentes = new Set(existentes.itens.map((i) => i.fingerprint).filter((f): f is string => !!f));
  const titulosNaPlanilha = new Set(previsao.dias.flatMap((d) => d.itens.map((i) => normalizarParaComparar(i.titulo))));

  const dias: DiaPrevisto[] = previsao.dias.map((d) => ({
    ...d,
    itens: d.itens.map((i) => {
      const c = i.linha === null || i.categoriaCerta ? undefined : porLinha.get(i.linha);
      if (!c) return i;
      return { ...i, categoria: c.categoria, turno: i.turno ?? c.turno };
    }),
    sugestoes: [],
  }));

  const usadas = new Set<string>();
  for (const s of curadoria.sugestoes) {
    const alvo = normalizarParaComparar(s.destino);
    if (!alvo) continue;
    const chave = fingerprintDaSugestao(s);
    if (usadas.has(chave) || titulosNaPlanilha.has(normalizarParaComparar(s.titulo))) continue;
    // Dia pedido pela Nora, se for do destino; senão o primeiro dia do destino.
    const doDestino = (d: DiaPrevisto) => normalizarParaComparar(d.destino).includes(alvo);
    const pedido = s.diaNumero !== null ? dias[s.diaNumero - 1] : undefined;
    const dia = pedido && doDestino(pedido) ? pedido : dias.find(doDestino);
    if (!dia) continue;
    usadas.add(chave);
    dia.sugestoes.push({
      chave,
      origem: "nora_sugestao",
      titulo: s.titulo,
      nota: s.porque,
      horario: "",
      turno: s.turno,
      categoria: s.categoria,
      categoriaCerta: true,
      custo: s.custoEstimadoBrl,
      linha: null,
      porque: s.porque,
      jaNoRoteiro: fingerprintsExistentes.has(chave),
    });
  }
  return { ...previsao, dias };
}

/** O que vem marcado ao abrir a prévia: as linhas da planilha que ainda não estão no roteiro. */
export function selecaoInicial(previsao: Previsao): Set<string> {
  return new Set(previsao.dias.flatMap((d) => d.itens.filter((i) => !i.jaNoRoteiro).map((i) => i.chave)));
}

/** Contagens da prévia para o resumo (novas, já no roteiro, sugestões). */
export function resumoDaPrevisao(previsao: Previsao, selecionados: ReadonlySet<string>) {
  let daPlanilha = 0;
  let jaNoRoteiro = 0;
  let sugestoes = 0;
  let sugestoesIncluidas = 0;
  for (const d of previsao.dias) {
    for (const i of d.itens) {
      if (i.jaNoRoteiro) jaNoRoteiro++;
      else daPlanilha++;
    }
    for (const s of d.sugestoes) {
      if (s.jaNoRoteiro) continue;
      sugestoes++;
      if (selecionados.has(s.chave)) sugestoesIncluidas++;
    }
  }
  let aSalvar = 0;
  for (const d of previsao.dias) {
    for (const i of [...d.itens, ...d.sugestoes]) if (!i.jaNoRoteiro && selecionados.has(i.chave)) aSalvar++;
  }
  return { daPlanilha, jaNoRoteiro, sugestoes, sugestoesIncluidas, aSalvar };
}

/* --------------------------------- gravação --------------------------------- */

export interface ContextoDeGravacao {
  userId: string;
  workspaceId: string;
  agoraIso: string;
  novoId: () => string;
}

export interface PlanoDeGravacao {
  diasNovos: RoteiroDia[];
  /** Dias que já existiam sem destino e agora o recebem. */
  diasComDestino: { id: string; destino: string }[];
  itens: RoteiroItem[];
}

/**
 * As gravações da seleção, na ordem em que entram na fila: dias novos
 * primeiro (o item depende do dia), depois as atividades. Cada atividade vai
 * para o fim do dia (a ordem continua a das que já estavam lá).
 */
export function planoDeGravacao(
  previsao: Previsao,
  selecionados: ReadonlySet<string>,
  existentes: Existentes,
  ctx: ContextoDeGravacao
): PlanoDeGravacao {
  const diasNovos: RoteiroDia[] = [];
  const diasComDestino: PlanoDeGravacao["diasComDestino"] = [];
  const itens: RoteiroItem[] = [];
  let proximaOrdemDia = existentes.dias.reduce((max, d) => Math.max(max, d.ordem), -1) + 1;

  for (const dia of previsao.dias) {
    const escolhidos = [...dia.itens, ...dia.sugestoes].filter((i) => !i.jaNoRoteiro && selecionados.has(i.chave));
    if (escolhidos.length === 0) continue;

    let diaId = dia.diaExistenteId;
    let proximaOrdemItem = 0;
    if (diaId) {
      const existente = existentes.dias.find((d) => d.id === diaId);
      if (existente && !(existente.destino ?? "").trim() && dia.destino) diasComDestino.push({ id: diaId, destino: dia.destino });
      proximaOrdemItem = existentes.itens.filter((i) => i.diaId === diaId).reduce((max, i) => Math.max(max, i.ordem), -1) + 1;
    } else {
      diaId = ctx.novoId();
      diasNovos.push({
        id: diaId,
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        data: dia.data,
        destino: dia.destino || null,
        ordem: proximaOrdemDia++,
        atualizadoEm: ctx.agoraIso,
        atualizadoPor: ctx.userId,
      });
    }
    // Atividades do dia por horário; as sugestões, que não têm hora, depois das da planilha do mesmo turno.
    for (const i of [...escolhidos].sort(porOrdem)) {
      itens.push({
        id: ctx.novoId(),
        workspaceId: ctx.workspaceId,
        diaId,
        horario: i.horario,
        turno: i.horario ? null : i.turno,
        titulo: i.titulo.slice(0, LIMITES_ROTEIRO.titulo),
        nota: i.nota.slice(0, LIMITES_ROTEIRO.nota),
        categoria: i.categoria,
        custoEstimado: i.custo,
        origem: i.origem,
        fingerprint: i.chave,
        ordem: proximaOrdemItem++,
        atualizadoEm: ctx.agoraIso,
        atualizadoPor: ctx.userId,
      });
    }
  }
  return { diasNovos, diasComDestino, itens };
}

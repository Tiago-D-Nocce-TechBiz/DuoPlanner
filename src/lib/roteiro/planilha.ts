import {
  CATEGORIAS_ROTEIRO,
  LIMITES_ROTEIRO,
  type CategoriaRoteiro,
  type LinhaPlanilha,
  type ProblemaPlanilha,
  type TurnoRoteiro,
} from "./tipos";

/**
 * Leitura (pura) da planilha do roteiro. Recebe a matriz de células que o
 * leitor de arquivo (xlsx ou csv) montou e devolve as atividades já limpas,
 * mais os problemas por linha. Não importa xlsx nem zod: roda no navegador
 * dentro do módulo de importação, que só carrega quando a pessoa o abre.
 *
 * Células vêm cruas: texto, número (data e hora do Excel chegam como número
 * de série) ou vazio. Cada coluna interpreta o que recebe.
 */

export type Celula = string | number | boolean | null | undefined;

/** Colunas do modelo oficial (`Destino`, `Data`...) e os apelidos aceitos. */
export const COLUNAS_DO_MODELO = [
  "Destino",
  "Data",
  "Turno_ou_Horario",
  "Atividade_ou_Lugar",
  "Categoria",
  "Custo_Estimado",
  "Observacoes",
] as const;

type Campo = "destino" | "data" | "turno" | "atividade" | "categoria" | "custo" | "observacoes";

const APELIDOS: Record<Campo, readonly string[]> = {
  destino: ["destino", "cidade", "local_de_destino"],
  data: ["data", "dia"],
  turno: ["turno_ou_horario", "turno", "horario", "hora"],
  atividade: ["atividade_ou_lugar", "atividade", "lugar", "titulo", "o_que"],
  categoria: ["categoria", "tipo"],
  custo: ["custo_estimado", "custo", "valor", "preco"],
  observacoes: ["observacoes", "observacao", "obs", "nota", "notas"],
};

/** Minúsculas, sem acento, só letras e números separados por "_". */
export function normalizarChave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Texto de uma célula: uma linha, sem caracteres de controle, aparado. */
export function textoDaCelula(c: Celula): string {
  if (c === null || c === undefined) return "";
  const bruto = String(c);
  return bruto.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

/* --------------------------------- datas ---------------------------------- */

function dataValida(a: number, m: number, d: number): string | null {
  if (a < 1900 || a > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(a, m - 1, d));
  if (t.getUTCFullYear() !== a || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
}

/** Número de série do Excel (dias desde 30/12/1899) → AAAA-MM-DD. */
export function dataDeSerialExcel(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 800_000) return null;
  const t = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return dataValida(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export type ResultadoData = { ok: true; data: string | null } | { ok: false; motivo: string };

/** "2026-09-10", "10/09/2026", "10-09-26", "10.09.2026" ou número de série do Excel. Vazio = sem data. */
export function lerData(c: Celula): ResultadoData {
  if (typeof c === "number") {
    const d = dataDeSerialExcel(c);
    return d ? { ok: true, data: d } : { ok: false, motivo: `data inválida (${c})` };
  }
  const t = textoDaCelula(c);
  if (!t) return { ok: true, data: null };
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(t);
  if (m) {
    const d = dataValida(Number(m[1]), Number(m[2]), Number(m[3]));
    return d ? { ok: true, data: d } : { ok: false, motivo: `data inválida (${t})` };
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = dataValida(ano, Number(m[2]), Number(m[1]));
    return d ? { ok: true, data: d } : { ok: false, motivo: `data inválida (${t})` };
  }
  if (/^\d{1,2}[-/.]\d{1,2}$/.test(t)) return { ok: false, motivo: `data sem o ano (${t}); use DD/MM/AAAA` };
  return { ok: false, motivo: `não entendi a data “${t}”; use DD/MM/AAAA ou AAAA-MM-DD` };
}

/* ------------------------------ turno e horário ----------------------------- */

export type ResultadoTurno =
  | { ok: true; horario: string | null; turno: TurnoRoteiro | null }
  | { ok: false; motivo: string };

const dois = (n: number) => String(n).padStart(2, "0");

/** Turno que um horário exato (HH:MM) indica. */
export function turnoDoHorario(horario: string): TurnoRoteiro {
  const h = Number(horario.slice(0, 2));
  return h < 12 ? "manha" : h < 18 ? "tarde" : "noite";
}

/** "Manhã", "tarde", "noite", "09:30", "9h", "9h30", "09:00-12:00" ou fração de dia do Excel. Vazio = sem turno. */
export function lerTurnoOuHorario(c: Celula): ResultadoTurno {
  if (typeof c === "number") {
    if (c >= 0 && c < 1) {
      const minutos = Math.round(c * 24 * 60);
      return { ok: true, horario: `${dois(Math.floor(minutos / 60) % 24)}:${dois(minutos % 60)}`, turno: null };
    }
    return { ok: false, motivo: `horário inválido (${c})` };
  }
  const t = textoDaCelula(c);
  if (!t) return { ok: true, horario: null, turno: null };
  const n = normalizarChave(t);
  if (/^(manha|de_manha|morning|am|m)$/.test(n)) return { ok: true, horario: null, turno: "manha" };
  if (/^(tarde|a_tarde|afternoon|pm|t)$/.test(n)) return { ok: true, horario: null, turno: "tarde" };
  if (/^(noite|a_noite|night|evening|n)$/.test(n)) return { ok: true, horario: null, turno: "noite" };
  // Hora exata (ou faixa: vale o começo): 9, 9h, 9h30, 09:30, 09:30:00, 9:30 - 12:00.
  const m = /^(\d{1,2})(?:\s*[:h]\s*(\d{2})?)?(?::\d{2})?(?:\s*(?:-|–|—|a|as|às)\s*.*)?$/i.exec(t.replace(/\s+/g, " "));
  if (m) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h <= 23 && min <= 59) return { ok: true, horario: `${dois(h)}:${dois(min)}`, turno: null };
  }
  return { ok: false, motivo: `não entendi o turno ou horário “${t}”; use Manhã, Tarde, Noite ou HH:MM` };
}

/* ---------------------------------- custo ---------------------------------- */

export type ResultadoCusto = { ok: true; custo: number | null } | { ok: false; motivo: string };

/** "R$ 1.234,56", "1234.56", "1,5", "grátis" (0). Vazio = sem estimativa. */
export function lerCusto(c: Celula): ResultadoCusto {
  let valor: number;
  if (typeof c === "number") valor = c;
  else {
    const t = textoDaCelula(c);
    if (!t) return { ok: true, custo: null };
    if (/^(gratis|gratuito|gratuita|free|de graca|sem custo)$/.test(normalizarChave(t).replace(/_/g, " "))) return { ok: true, custo: 0 };
    const limpo = t.replace(/r\$|brl|\s/gi, "");
    if (!/^-?[\d.,]+$/.test(limpo)) return { ok: false, motivo: `não entendi o custo “${t}”` };
    let numero: string;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpo)) numero = limpo.replace(/\./g, "").replace(",", ".");
    else if (limpo.includes(",")) numero = limpo.replace(/\./g, "").replace(",", ".");
    else numero = limpo;
    valor = Number(numero);
  }
  if (!Number.isFinite(valor)) return { ok: false, motivo: "custo inválido" };
  if (valor < 0) return { ok: false, motivo: "o custo não pode ser negativo" };
  if (valor > LIMITES_ROTEIRO.custoMaximo) return { ok: false, motivo: "custo acima de R$ 1.000.000" };
  return { ok: true, custo: Math.round(valor * 100) / 100 };
}

/* -------------------------------- categoria -------------------------------- */

const PALAVRAS: readonly [CategoriaRoteiro, RegExp][] = [
  ["Praia", /\b(praia|praias|beach|litoral|mar|banho de mar|faixa de areia|baia|enseada)\b/],
  ["Hospedagem", /\b(hospedagem|hotel|hostel|airbnb|pousada|resort|check in|check out|checkin|checkout|apart hotel)\b/],
  ["Transporte", /\b(transporte|voo|aviao|aeroporto|onibus|rodoviaria|trem|metro|uber|taxi|transfer|traslado|carro|aluguel de carro|ferry|balsa|barca)\b/],
  ["Gastronomia", /\b(gastronomia|restaurante|comida|jantar|almoco|cafe|brunch|bar|boteco|padaria|pastelaria|petisco|sorvete|churrascaria|pizzaria|degustacao|culinaria)\b/],
  ["Passeio", /\b(passeio|passeios|tour|atracao|museu|trilha|visita|parque|excursao|ingresso|show|mirante|igreja|castelo|catedral|city tour|barco|mergulho|safari)\b/],
];

/** Categoria pelo texto (as 6 do app) e se foi reconhecida. Hospedagem e Transporte vêm antes de Praia/Passeio de propósito. */
export function categoriaDoTexto(texto: string): { categoria: CategoriaRoteiro; reconhecida: boolean } {
  const n = normalizarChave(texto).replace(/_/g, " ");
  if (!n) return { categoria: "Outros", reconhecida: false };
  const direta = CATEGORIAS_ROTEIRO.find((c) => normalizarChave(c) === normalizarChave(texto));
  if (direta) return { categoria: direta, reconhecida: true };
  for (const [categoria, re] of PALAVRAS) if (re.test(n)) return { categoria, reconhecida: true };
  return { categoria: "Outros", reconhecida: false };
}

/* --------------------------------- planilha -------------------------------- */

export interface ResultadoPlanilha {
  linhas: LinhaPlanilha[];
  problemas: ProblemaPlanilha[];
  /** Linhas de dados lidas (sem cabeçalho e sem as vazias). */
  lidas: number;
}

const LINHAS_PARA_ACHAR_CABECALHO = 10;

function acharCabecalho(matriz: readonly (readonly Celula[])[]): { indice: number; colunas: Partial<Record<Campo, number>> } | null {
  let melhor: { indice: number; colunas: Partial<Record<Campo, number>>; pontos: number } | null = null;
  for (let i = 0; i < Math.min(matriz.length, LINHAS_PARA_ACHAR_CABECALHO); i++) {
    const colunas: Partial<Record<Campo, number>> = {};
    matriz[i].forEach((c, j) => {
      const chave = normalizarChave(textoDaCelula(c));
      if (!chave) return;
      for (const campo of Object.keys(APELIDOS) as Campo[]) {
        if (colunas[campo] === undefined && APELIDOS[campo].includes(chave)) colunas[campo] = j;
      }
    });
    const pontos = Object.keys(colunas).length;
    if (colunas.atividade !== undefined && pontos >= 2 && (!melhor || pontos > melhor.pontos)) melhor = { indice: i, colunas, pontos };
  }
  return melhor;
}

function encurtar(texto: string, max: number): { texto: string; cortado: boolean } {
  return texto.length <= max ? { texto, cortado: false } : { texto: `${texto.slice(0, max - 1).trimEnd()}…`, cortado: true };
}

/** Interpreta a matriz da planilha. Nunca lança: o que não serve vira problema apontando a linha. */
export function interpretarPlanilha(matriz: readonly (readonly Celula[])[]): ResultadoPlanilha {
  const problemas: ProblemaPlanilha[] = [];
  const cab = acharCabecalho(matriz);
  if (!cab) {
    return {
      linhas: [],
      lidas: 0,
      problemas: [
        {
          linha: null,
          gravidade: "erro",
          mensagem: "Não achei o cabeçalho. A planilha precisa ter a coluna Atividade_ou_Lugar e ao menos mais uma (use o modelo oficial).",
        },
      ],
    };
  }
  const { colunas } = cab;
  const pega = (linha: readonly Celula[], campo: Campo): Celula => (colunas[campo] === undefined ? null : linha[colunas[campo]!]);
  const linhas: LinhaPlanilha[] = [];
  let lidas = 0;

  for (let i = cab.indice + 1; i < matriz.length; i++) {
    const bruta = matriz[i];
    if (bruta.every((c) => textoDaCelula(c) === "")) continue;
    const numero = i + 1;
    lidas++;
    if (lidas > LIMITES_ROTEIRO.linhas) {
      problemas.push({
        linha: null,
        gravidade: "erro",
        mensagem: `A planilha tem mais de ${LIMITES_ROTEIRO.linhas} linhas. Importei as primeiras ${LIMITES_ROTEIRO.linhas}; divida o resto em outro arquivo.`,
      });
      lidas = LIMITES_ROTEIRO.linhas;
      break;
    }
    const erro = (mensagem: string) => problemas.push({ linha: numero, gravidade: "erro", mensagem });
    const aviso = (mensagem: string) => problemas.push({ linha: numero, gravidade: "aviso", mensagem });

    const atividadeBruta = textoDaCelula(pega(bruta, "atividade"));
    if (!atividadeBruta) {
      erro("sem Atividade_ou_Lugar; a linha foi ignorada");
      continue;
    }
    const atividade = encurtar(atividadeBruta, LIMITES_ROTEIRO.titulo);
    if (atividade.cortado) aviso(`atividade com mais de ${LIMITES_ROTEIRO.titulo} caracteres; foi encurtada`);

    const destino = encurtar(textoDaCelula(pega(bruta, "destino")), LIMITES_ROTEIRO.destino);
    if (destino.cortado) aviso(`destino com mais de ${LIMITES_ROTEIRO.destino} caracteres; foi encurtado`);

    const d = lerData(pega(bruta, "data"));
    let data: string | null = null;
    if (d.ok) data = d.data;
    else aviso(`${d.motivo}; a atividade entrou em “dia sem data”`);

    const t = lerTurnoOuHorario(pega(bruta, "turno"));
    let horario: string | null = null;
    let turno: TurnoRoteiro | null = null;
    if (t.ok) {
      horario = t.horario;
      turno = t.turno;
    } else aviso(`${t.motivo}; ficou sem turno`);

    const c = lerCusto(pega(bruta, "custo"));
    let custo: number | null = null;
    if (c.ok) custo = c.custo;
    else aviso(`${c.motivo}; ficou sem estimativa de custo`);

    const categoriaTexto = textoDaCelula(pega(bruta, "categoria"));
    let { categoria, reconhecida } = categoriaDoTexto(categoriaTexto);
    if (!categoriaTexto || !reconhecida) {
      // Sem categoria escrita (ou desconhecida): tenta pelo nome da atividade.
      const pelaAtividade = categoriaDoTexto(atividadeBruta);
      if (pelaAtividade.reconhecida) {
        categoria = pelaAtividade.categoria;
        reconhecida = true;
      }
    }

    const obs = encurtar(textoDaCelula(pega(bruta, "observacoes")), LIMITES_ROTEIRO.nota);
    if (obs.cortado) aviso(`observações com mais de ${LIMITES_ROTEIRO.nota} caracteres; foram encurtadas`);

    linhas.push({
      linha: numero,
      destino: destino.texto,
      data,
      horario,
      turno,
      atividade: atividade.texto,
      categoria,
      categoriaCerta: reconhecida,
      custo,
      observacoes: obs.texto,
    });
  }
  if (lidas === 0) problemas.push({ linha: null, gravidade: "erro", mensagem: "A planilha não tem nenhuma atividade abaixo do cabeçalho." });
  return { linhas, problemas, lidas };
}

/** O turno efetivo da linha: o escrito, ou o que o horário exato indica. */
export function turnoEfetivo(l: Pick<LinhaPlanilha, "turno" | "horario">): TurnoRoteiro | null {
  return l.turno ?? (l.horario ? turnoDoHorario(l.horario) : null);
}

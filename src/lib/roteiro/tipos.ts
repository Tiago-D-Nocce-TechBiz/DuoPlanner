/**
 * Tipos e constantes do Roteiro com planilha. Sem dependências de propósito:
 * é importado pela tela (navegador), pelos modelos de sincronização e pelo
 * servidor, e não pode puxar zod, xlsx nem LangChain.
 */

/** Categorias do roteiro. As quatro primeiras são os filtros rápidos da tela. */
export const CATEGORIAS_ROTEIRO = ["Praia", "Passeio", "Gastronomia", "Transporte", "Hospedagem", "Outros"] as const;
export type CategoriaRoteiro = (typeof CATEGORIAS_ROTEIRO)[number];

/** Filtros da tela: "Todos" e as categorias que mais se procuram. */
export const FILTROS_ROTEIRO = ["Todos", "Praia", "Passeio", "Gastronomia", "Transporte"] as const;
export type FiltroRoteiro = (typeof FILTROS_ROTEIRO)[number];

export const TURNOS_ROTEIRO = ["manha", "tarde", "noite"] as const;
export type TurnoRoteiro = (typeof TURNOS_ROTEIRO)[number];
export const ROTULO_TURNO: Record<TurnoRoteiro, string> = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };

/** De onde a atividade veio: digitada, linha da planilha ou sugestão aceita da Nora. */
export const ORIGENS_ROTEIRO = ["manual", "planilha", "nora_sugestao"] as const;
export type OrigemRoteiro = (typeof ORIGENS_ROTEIRO)[number];

/** "r1:" + SHA-256 em 64 dígitos hexadecimais (ver `fingerprint-roteiro.ts`). */
export const FORMATO_FINGERPRINT_ROTEIRO = /^r1:[0-9a-f]{64}$/;

/** Tetos que espelham as CHECKs do banco e protegem o navegador. */
export const LIMITES_ROTEIRO = {
  titulo: 120,
  nota: 500,
  destino: 80,
  categoria: 40,
  custoMaximo: 1_000_000,
  /** Linhas de dados aceitas por planilha. */
  linhas: 300,
  /** Tamanho máximo do arquivo, em bytes. */
  arquivoBytes: 2 * 1024 * 1024,
} as const;

/** Uma atividade como a planilha a descreve, já limpa e validada. */
export interface LinhaPlanilha {
  /** Número da linha na planilha (1 = cabeçalho), para apontar erros. */
  linha: number;
  destino: string;
  /** AAAA-MM-DD ou null (dia sem data). */
  data: string | null;
  /** Horário exato (HH:MM) quando a planilha trouxe um; senão null. */
  horario: string | null;
  turno: TurnoRoteiro | null;
  atividade: string;
  categoria: CategoriaRoteiro;
  /** A categoria veio escrita na planilha (ou foi inferida por palavras-chave)? */
  categoriaCerta: boolean;
  /** Em reais; null = sem estimativa. */
  custo: number | null;
  observacoes: string;
}

export interface ProblemaPlanilha {
  /** Linha da planilha (1 = cabeçalho) ou null para problemas do arquivo. */
  linha: number | null;
  /** "erro": a linha não entra. "aviso": entra, com ajuste. */
  gravidade: "erro" | "aviso";
  mensagem: string;
}

/* ------------------------- curadoria da Nora (servidor ↔ tela) ------------------------- */

/** Uma sugestão da Nora para um destino da planilha: lugar, categoria e o porquê. */
export interface SugestaoNora {
  destino: string;
  titulo: string;
  categoria: CategoriaRoteiro;
  /** Por que vale a pena, em PT-BR (aparece no card). */
  porque: string;
  turno: TurnoRoteiro | null;
  /** Dia (1 = primeiro da prévia) em que a Nora a encaixaria; null = a tela escolhe. */
  diaNumero: number | null;
  /** Estimativa histórica em reais; null = não sabe. */
  custoEstimadoBrl: number | null;
}

/** A Nora classificou uma linha cuja categoria a planilha não deixou clara. */
export interface ClassificacaoLinha {
  linha: number;
  categoria: CategoriaRoteiro;
  turno: TurnoRoteiro | null;
}

export interface ResultadoCuradoria {
  /** "ia": Gemini; "local": organização determinística (sem chave, cota, prazo ou conexão). */
  origem: "ia" | "local";
  /** Por que não houve sugestões da IA, em PT-BR. */
  aviso: string | null;
  classificacoes: ClassificacaoLinha[];
  sugestoes: SugestaoNora[];
}

/** O que a tela envia à Server Action da curadoria (só texto já limpo, nunca o arquivo). */
export interface DiaParaCuradoria {
  /** 1 = primeiro dia da prévia. */
  numero: number;
  data: string | null;
  destino: string;
}

export interface LinhaParaCuradoria {
  linha: number;
  /** Número do dia da prévia em que a atividade está. */
  dia: number | null;
  destino: string;
  data: string | null;
  atividade: string;
  categoria: CategoriaRoteiro;
  /** A planilha não deixou a categoria clara: a Nora a classifica. */
  classificar: boolean;
}

export interface EntradaCuradoria {
  incluirSugestoes: boolean;
  dias: DiaParaCuradoria[];
  linhas: LinhaParaCuradoria[];
}

/** Separador entre destinos de um mesmo dia (ex.: "Lisboa · Sintra"). */
export const SEPARADOR_DE_DESTINOS = " · ";

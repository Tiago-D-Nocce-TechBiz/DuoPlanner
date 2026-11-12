import { z } from "zod";
// Só imports relativos (aqui e nos módulos importados): o next.config.ts
// carrega este arquivo, e o transpilador dele não resolve o alias "@/" em
// arquivos aninhados. O teste "imports do esquema" vigia isso.
import { TAMANHO_MINIMO_SEGREDO } from "../cron/segredo";
import { lerChaveCifra } from "../seguranca/cripto-documentos-nucleo";
import {
  base64ComBytes,
  chaveEhPublica,
  chaveEhSecreta,
  hostValido,
  remetenteValido,
  SITE_URL_PADRAO,
  urlValida,
  vazioParaAusente,
} from "./validadores";

/**
 * Ambiente do servidor validado com zod (puro: recebe as variáveis, testável).
 *
 * Duas classes de problema:
 *  - ERRO (fail-fast): valor presente mas malformado ou incoerente, como uma
 *    chave secreta numa variável NEXT_PUBLIC_ (iria para o navegador), URL
 *    inválida, CRON_SECRET curto ou chave de cifra que não tem 32 bytes. O
 *    `next.config.ts` interrompe o build e o `instrumentation.ts` recusa subir
 *    o servidor: é configuração quebrada, não "modo degradado".
 *  - AUSENTE: a integração fica em modo degradado e `statusDasIntegracoes`
 *    diz o que o app faz sem ela. Nada quebra.
 */

export const VARIAVEIS = [
  "NODE_ENV",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_API_BASE_URL",
  "KIWI_API_KEY",
  "KIWI_API_BASE_URL",
  "RAPIDAPI_KEY",
  "RAPIDAPI_BOOKING_HOST",
  "RESEND_API_KEY",
  "EMAIL_REMETENTE",
  "CRON_SECRET",
  "DOCUMENTOS_CHAVE_CRIPTO",
] as const;

export type NomeVariavel = (typeof VARIAVEIS)[number];
export type FonteAmbiente = Readonly<Record<string, string | undefined>>;

/** Mesmo mínimo que a rota de cron exige (`verificarSegredoCron`). */
export const TAMANHO_MINIMO_CRON_SECRET = TAMANHO_MINIMO_SEGREDO;

export interface AmbienteServidor {
  producao: boolean;
  /** Sempre preenchida (padrão quando ausente). */
  siteUrl: string;
  siteUrlConfigurada: boolean;
  supabase: { url: string; chavePublica: string } | null;
  /** Chave secreta (ignora a RLS): só para as tarefas agendadas. */
  supabaseAdmin: { url: string; chaveSecreta: string } | null;
  ia: { apiKey: string; modelo: string | null; baseUrl: string | null } | null;
  voos: { apiKey: string; baseUrl: string | null } | null;
  hospedagem: { apiKey: string; host: string | null } | null;
  email: { apiKey: string; remetente: string | null } | null;
  cronSecret: string | null;
  chaveDocumentos: Buffer | null;
}

export type NomeIntegracao =
  | "supabase"
  | "tarefasAgendadas"
  | "ia"
  | "voos"
  | "hospedagem"
  | "email"
  | "criptografiaDocumentos";

export interface StatusIntegracao {
  rotulo: string;
  ativa: boolean;
  /** O que o app faz quando ela está desligada (modo degradado). */
  semEla: string;
  /** Variáveis que a ligam. */
  variaveis: string[];
}

export interface ProblemaAmbiente {
  variavel: string;
  mensagem: string;
}

export type ResultadoAmbiente =
  | {
      ok: true;
      ambiente: AmbienteServidor;
      integracoes: Record<NomeIntegracao, StatusIntegracao>;
      avisos: ProblemaAmbiente[];
    }
  | { ok: false; erros: ProblemaAmbiente[] };

/* ------------------------------- esquema ------------------------------- */

const texto = z.string().optional().transform(vazioParaAusente);

const url = (dica: string) =>
  texto.refine((v) => v === undefined || urlValida(v) !== null, `${dica}: use uma URL https completa (http só em localhost).`);

const esquema = z
  .object({
    NODE_ENV: texto,
    NEXT_PUBLIC_SUPABASE_URL: url("URL do projeto Supabase"),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: texto,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: texto,
    NEXT_PUBLIC_SITE_URL: url("URL pública do site"),
    SUPABASE_SECRET_KEY: texto,
    SUPABASE_SERVICE_ROLE_KEY: texto,
    GEMINI_API_KEY: texto,
    GOOGLE_API_KEY: texto,
    GEMINI_MODEL: texto.refine(
      (v) => v === undefined || /^[a-z0-9][a-z0-9.\-]{1,63}$/.test(v),
      "Nome de modelo inválido (ex.: gemini-3.8-flash)."
    ),
    GEMINI_API_BASE_URL: url("Endereço da API do Gemini"),
    KIWI_API_KEY: texto,
    KIWI_API_BASE_URL: url("Endereço da API da Kiwi"),
    RAPIDAPI_KEY: texto,
    RAPIDAPI_BOOKING_HOST: texto.refine((v) => v === undefined || hostValido(v), "Use só o nome do host (ex.: booking-com15.p.rapidapi.com)."),
    RESEND_API_KEY: texto,
    EMAIL_REMETENTE: texto.refine(
      (v) => v === undefined || remetenteValido(v),
      "Use \"Nome <email@dominio>\" ou \"email@dominio\" (domínio verificado na Resend)."
    ),
    CRON_SECRET: texto.refine(
      (v) => v === undefined || v.length >= TAMANHO_MINIMO_CRON_SECRET,
      `Use pelo menos ${TAMANHO_MINIMO_CRON_SECRET} caracteres aleatórios.`
    ),
    DOCUMENTOS_CHAVE_CRIPTO: texto.refine(
      (v) => v === undefined || base64ComBytes(v, 32),
      "Precisa ser base64 de exatamente 32 bytes (gere com crypto.randomBytes(32))."
    ),
  })
  .superRefine((v, ctx) => {
    const erro = (variavel: string, message: string) => ctx.addIssue({ code: "custom", path: [variavel], message });
    const chavePublica = v.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? v.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const nomeChavePublica = v.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
      : "NEXT_PUBLIC_SUPABASE_ANON_KEY";

    if (v.NEXT_PUBLIC_SUPABASE_URL && !chavePublica) {
      erro("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "Falta a chave pública do Supabase (a URL está definida).");
    }
    if (chavePublica && !v.NEXT_PUBLIC_SUPABASE_URL) {
      erro("NEXT_PUBLIC_SUPABASE_URL", "Falta a URL do projeto Supabase (a chave pública está definida).");
    }
    const secreta = v.SUPABASE_SECRET_KEY ?? v.SUPABASE_SERVICE_ROLE_KEY;
    const nomeSecreta = v.SUPABASE_SECRET_KEY ? "SUPABASE_SECRET_KEY" : "SUPABASE_SERVICE_ROLE_KEY";
    if (secreta && chaveEhPublica(secreta)) {
      erro(nomeSecreta, "Esta é a chave pública (publishable/anon). Use a chave secreta (sb_secret_... ou service_role).");
    }
    if (secreta && !v.NEXT_PUBLIC_SUPABASE_URL) {
      erro("NEXT_PUBLIC_SUPABASE_URL", "A chave secreta do Supabase precisa da URL do projeto.");
    }
    if (chavePublica && chaveEhSecreta(chavePublica)) {
      erro(nomeChavePublica, "Chave SECRETA numa variável NEXT_PUBLIC_: ela iria para o navegador e ignoraria a RLS.");
    }
  });

/* --------------------------- análise e status --------------------------- */

export function analisarAmbiente(fonte: FonteAmbiente): ResultadoAmbiente {
  const erros: ProblemaAmbiente[] = [];

  // Qualquer NEXT_PUBLIC_ com cara de chave secreta vai parar no navegador.
  for (const [nome, valor] of Object.entries(fonte)) {
    const limpo = vazioParaAusente(valor);
    if (nome.startsWith("NEXT_PUBLIC_") && limpo && chaveEhSecreta(limpo)) {
      erros.push({ variavel: nome, mensagem: "Chave SECRETA numa variável NEXT_PUBLIC_: ela iria para o navegador." });
    }
  }

  const lido = esquema.safeParse(Object.fromEntries(VARIAVEIS.map((nome) => [nome, fonte[nome]])));
  if (!lido.success) {
    for (const issue of lido.error.issues) {
      const variavel = String(issue.path[0] ?? "ambiente");
      if (!erros.some((e) => e.variavel === variavel)) erros.push({ variavel, mensagem: issue.message });
    }
  }
  if (erros.length > 0 || !lido.success) return { ok: false, erros };

  const v = lido.data;
  const producao = v.NODE_ENV === "production";
  const chavePublica = v.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? v.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseUrl = v.NEXT_PUBLIC_SUPABASE_URL ? urlValida(v.NEXT_PUBLIC_SUPABASE_URL) : null;
  const secreta = v.SUPABASE_SECRET_KEY ?? v.SUPABASE_SERVICE_ROLE_KEY;
  const iaKey = v.GEMINI_API_KEY ?? v.GOOGLE_API_KEY;

  const ambiente: AmbienteServidor = {
    producao,
    siteUrl: (v.NEXT_PUBLIC_SITE_URL && urlValida(v.NEXT_PUBLIC_SITE_URL)) || SITE_URL_PADRAO,
    siteUrlConfigurada: Boolean(v.NEXT_PUBLIC_SITE_URL),
    supabase: supabaseUrl && chavePublica ? { url: supabaseUrl, chavePublica } : null,
    supabaseAdmin: supabaseUrl && secreta ? { url: supabaseUrl, chaveSecreta: secreta } : null,
    ia: iaKey
      ? { apiKey: iaKey, modelo: v.GEMINI_MODEL ?? null, baseUrl: v.GEMINI_API_BASE_URL ? urlValida(v.GEMINI_API_BASE_URL) : null }
      : null,
    voos: v.KIWI_API_KEY
      ? { apiKey: v.KIWI_API_KEY, baseUrl: v.KIWI_API_BASE_URL ? urlValida(v.KIWI_API_BASE_URL) : null }
      : null,
    hospedagem: v.RAPIDAPI_KEY ? { apiKey: v.RAPIDAPI_KEY, host: v.RAPIDAPI_BOOKING_HOST ?? null } : null,
    email: v.RESEND_API_KEY ? { apiKey: v.RESEND_API_KEY, remetente: v.EMAIL_REMETENTE ?? null } : null,
    cronSecret: v.CRON_SECRET ?? null,
    chaveDocumentos: lerChaveCifra(v.DOCUMENTOS_CHAVE_CRIPTO),
  };

  const avisos: ProblemaAmbiente[] = [];
  if (producao && !ambiente.siteUrlConfigurada) {
    avisos.push({ variavel: "NEXT_PUBLIC_SITE_URL", mensagem: `Ausente: links de convite e e-mails usam ${SITE_URL_PADRAO}.` });
  }
  if (v.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && v.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    avisos.push({ variavel: "NEXT_PUBLIC_SUPABASE_ANON_KEY", mensagem: "Ignorada: vale a NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY." });
  }
  if (ambiente.email && !ambiente.email.apiKey.startsWith("re_")) {
    avisos.push({ variavel: "RESEND_API_KEY", mensagem: "Não parece uma chave da Resend (começa com re_)." });
  }
  if (producao && ambiente.email && !ambiente.email.remetente) {
    avisos.push({
      variavel: "EMAIL_REMETENTE",
      mensagem: "Ausente: usando onboarding@resend.dev, que só entrega para o e-mail da conta da Resend.",
    });
  }
  if (ambiente.cronSecret && !ambiente.supabaseAdmin) {
    avisos.push({ variavel: "SUPABASE_SECRET_KEY", mensagem: "CRON_SECRET definido, mas sem a chave secreta as tarefas agendadas respondem 503." });
  }

  return { ok: true, ambiente, integracoes: statusDasIntegracoes(ambiente), avisos };
}

export function statusDasIntegracoes(a: AmbienteServidor): Record<NomeIntegracao, StatusIntegracao> {
  return {
    supabase: {
      rotulo: "Contas e banco (Supabase)",
      ativa: a.supabase !== null,
      semEla: a.producao
        ? "Sem login nem sincronização: o painel fica bloqueado (fail-closed)."
        : "Painel aberto sem login (só em desenvolvimento) e dados só neste aparelho.",
      variaveis: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    },
    tarefasAgendadas: {
      rotulo: "Tarefas agendadas (alertas e resumo semanal)",
      ativa: a.supabaseAdmin !== null && a.cronSecret !== null,
      semEla: "Os alertas de preço não são verificados e o resumo semanal não sai (as rotas de cron respondem 503).",
      variaveis: ["SUPABASE_SECRET_KEY", "CRON_SECRET"],
    },
    ia: {
      rotulo: "IA (Gemini)",
      ativa: a.ia !== null,
      semEla: "Recibos não são lidos e a fatura é categorizada só pelo catálogo local.",
      variaveis: ["GEMINI_API_KEY"],
    },
    voos: {
      rotulo: "Preços de voos (Kiwi.com)",
      ativa: a.voos !== null,
      semEla: "A busca de voos mostra só os links dos parceiros, sem preços.",
      variaveis: ["KIWI_API_KEY"],
    },
    hospedagem: {
      rotulo: "Preços de hospedagem (Booking.com via RapidAPI)",
      ativa: a.hospedagem !== null,
      semEla: "A busca de hospedagem mostra só os links dos parceiros, sem preços.",
      variaveis: ["RAPIDAPI_KEY"],
    },
    email: {
      rotulo: "E-mails (Resend)",
      ativa: a.email !== null,
      semEla: "Nenhum e-mail sai: alertas, resumo e convites ficam só registrados no log.",
      variaveis: ["RESEND_API_KEY", "EMAIL_REMETENTE"],
    },
    criptografiaDocumentos: {
      rotulo: "Cifra dos documentos (AES-256-GCM)",
      ativa: a.chaveDocumentos !== null,
      semEla: "Só os 4 últimos caracteres dos documentos são guardados.",
      variaveis: ["DOCUMENTOS_CHAVE_CRIPTO"],
    },
  };
}

/** Relatório legível (boot do servidor e mensagem do erro de ambiente). */
export function descreverAmbiente(r: ResultadoAmbiente): string {
  if (!r.ok) {
    return [
      "Configuração de ambiente inválida:",
      ...r.erros.map((e) => `  - ${e.variavel}: ${e.mensagem}`),
      "Corrija as variáveis (Vercel → Settings → Environment Variables, ou .env.local).",
    ].join("\n");
  }
  const linhas = Object.values(r.integracoes).map((i) =>
    i.ativa ? `  [ativa]     ${i.rotulo}` : `  [degradada] ${i.rotulo}: ${i.semEla}`
  );
  const avisos = r.avisos.map((a) => `  aviso ${a.variavel}: ${a.mensagem}`);
  return ["Integrações do DuoPlanner:", ...linhas, ...avisos].join("\n");
}

export class ErroDeAmbiente extends Error {
  constructor(public readonly erros: ProblemaAmbiente[]) {
    super(descreverAmbiente({ ok: false, erros }));
    this.name = "ErroDeAmbiente";
  }
}

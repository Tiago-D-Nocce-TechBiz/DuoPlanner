import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { obterSessao, type Sessao } from "@/lib/auth/sessao";
import { falha, sucesso, type CodigoErro, type Falha, type ResultadoAcao } from "./resultado";

/**
 * Envoltórios das Server Actions.
 *
 * Server Action é endpoint público: aceita POST em qualquer rota, com
 * qualquer corpo. Todo envoltório:
 *  1. valida a sessão com `getClaims()` (`withAuth*`; nunca `getSession()`);
 *  2. valida a entrada com zod ANTES do handler (o handler recebe o tipo já
 *     limpo; o cliente envia `z.input`);
 *  3. devolve sempre `ResultadoAcao` (`./resultado`). Falha prevista: o
 *     handler lança `ErroAcao(code, mensagem)`. Qualquer outra exceção é
 *     registrada no log com uma referência e vira ERRO_INTERNO com mensagem
 *     genérica: stack trace e detalhes nunca chegam ao navegador;
 *  4. deixa passar o que é do Next (`redirect()`, `notFound()`, `refresh()`):
 *     `unstable_rethrow` relança antes de qualquer tratamento.
 */

export class ErroAcao extends Error {
  constructor(
    readonly code: CodigoErro,
    message: string
  ) {
    super(message);
    this.name = "ErroAcao";
  }
}

export interface ContextoAcao {
  sessao: Sessao;
}

type Esquema = z.ZodType;

function referencia(): string {
  return crypto.randomUUID().slice(0, 8);
}

function entradaInvalida(erro: z.ZodError): Falha {
  return falha("ENTRADA_INVALIDA", erro.issues[0]?.message ?? "Dados inválidos.");
}

async function protegido<T>(nome: string, corpo: () => Promise<ResultadoAcao<T>>): Promise<ResultadoAcao<T>> {
  try {
    return await corpo();
  } catch (erro) {
    unstable_rethrow(erro);
    if (erro instanceof ErroAcao) return falha(erro.code, erro.message);
    const ref = referencia();
    console.error(`[acao:${nome}] erro inesperado (ref ${ref}):`, erro);
    return falha("ERRO_INTERNO", `Algo deu errado do nosso lado. Tente de novo em instantes (ref. ${ref}).`);
  }
}

async function comSessao<T>(corpo: (ctx: ContextoAcao) => Promise<ResultadoAcao<T>>): Promise<ResultadoAcao<T>> {
  const auth = await obterSessao();
  if (!auth.ok) return falha(auth.motivo === "nao_configurado" ? "NAO_CONFIGURADO" : "NAO_AUTENTICADO", auth.mensagem);
  return corpo({ sessao: auth.sessao });
}

function validar<S extends Esquema>(esquema: S, entrada: unknown): { ok: true; dados: z.output<S> } | { ok: false; falha: Falha } {
  const lido = esquema.safeParse(entrada);
  return lido.success ? { ok: true, dados: lido.data as z.output<S> } : { ok: false, falha: entradaInvalida(lido.error) };
}

/* -------------------------------- com sessão -------------------------------- */

export function withAuthAction<O>(nome: string, handler: (ctx: ContextoAcao) => Promise<O>): () => Promise<ResultadoAcao<O>>;
export function withAuthAction<S extends Esquema, O>(
  nome: string,
  esquema: S,
  handler: (entrada: z.output<S>, ctx: ContextoAcao) => Promise<O>
): (entrada: z.input<S>) => Promise<ResultadoAcao<O>>;
export function withAuthAction<S extends Esquema, O>(
  nome: string,
  esquemaOuHandler: S | ((ctx: ContextoAcao) => Promise<O>),
  talvezHandler?: (entrada: z.output<S>, ctx: ContextoAcao) => Promise<O>
) {
  if (typeof esquemaOuHandler === "function") {
    const handler = esquemaOuHandler as (ctx: ContextoAcao) => Promise<O>;
    return async (): Promise<ResultadoAcao<O>> =>
      protegido(nome, () => comSessao(async (ctx) => sucesso(await handler(ctx))));
  }
  const esquema = esquemaOuHandler;
  const handler = talvezHandler!;
  return async (entrada: z.input<S>): Promise<ResultadoAcao<O>> =>
    protegido(nome, () =>
      comSessao(async (ctx) => {
        const lido = validar(esquema, entrada);
        return lido.ok ? sucesso(await handler(lido.dados, ctx)) : lido.falha;
      })
    );
}

/**
 * Para `<form action>` com `useActionState`: `(estadoAnterior, formData)`.
 * O esquema valida `Object.fromEntries(formData)`.
 */
export function withAuthFormAction<S extends Esquema, O>(
  nome: string,
  esquema: S,
  handler: (entrada: z.output<S>, ctx: ContextoAcao) => Promise<O>
): (anterior: ResultadoAcao<O> | null, formData: FormData) => Promise<ResultadoAcao<O>> {
  return async (_anterior, formData) =>
    protegido(nome, () =>
      comSessao(async (ctx) => {
        const lido = validar(esquema, Object.fromEntries(formData));
        return lido.ok ? sucesso(await handler(lido.dados, ctx)) : lido.falha;
      })
    );
}

/* --------------------------------- públicas --------------------------------- */

/**
 * Sem sessão (login, cadastro, sair): mesma validação e o mesmo tratamento de
 * erro. Use só onde não estar logado é o caso normal.
 */
export function withPublicAction<O>(nome: string, handler: () => Promise<O>): () => Promise<ResultadoAcao<O>> {
  return async () => protegido(nome, async () => sucesso(await handler()));
}

export function withPublicFormAction<S extends Esquema, O>(
  nome: string,
  esquema: S,
  handler: (entrada: z.output<S>) => Promise<O>
): (anterior: ResultadoAcao<O> | null, formData: FormData) => Promise<ResultadoAcao<O>> {
  return async (_anterior, formData) =>
    protegido(nome, async () => {
      const lido = validar(esquema, Object.fromEntries(formData));
      return lido.ok ? sucesso(await handler(lido.dados)) : lido.falha;
    });
}

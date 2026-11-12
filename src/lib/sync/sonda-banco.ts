import type { SupabaseClient } from "@supabase/supabase-js";
import { colunaAusente, tabelaAusente } from "@/lib/auth/seguranca";
import { COLUNAS, RECURSOS, TABELAS } from "./modelos";

/**
 * O banco já tem as tabelas E as colunas que esta versão do app lê e grava?
 *
 * Uma consulta GET por recurso, com as colunas reais e `limit(0)` (nenhuma
 * linha volta). Não usar `head: true`: numa requisição HEAD o PostgREST não
 * manda corpo, e o supabase-js transforma o 404 de "tabela inexistente" em
 * sucesso ("204 No Content") e o 400 de "coluna inexistente" num erro sem
 * código. A sonda antiga dizia "pronto" mesmo sem a migration.
 *
 * Só tabela ou coluna ausente conta como "não pronto" (modo local: a fila
 * espera no aparelho). Outras falhas (rede, instabilidade) não: o motor
 * trata e tenta de novo.
 */
export async function bancoPronto(supabase: SupabaseClient): Promise<boolean> {
  const sondas = await Promise.all(RECURSOS.map((r) => supabase.from(TABELAS[r]).select(COLUNAS[r]).limit(0)));
  return sondas.every(({ error }) => !tabelaAusente(error) && !colunaAusente(error));
}

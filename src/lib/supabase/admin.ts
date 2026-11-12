import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ambiente } from "@/lib/env";

/**
 * Cliente com a chave SECRETA do Supabase: ignora a RLS.
 *
 * Só para as tarefas agendadas (/api/cron/*), que rodam sem usuário logado e
 * precisam ler dados de várias contas. Como a RLS não protege nada aqui, o
 * código que usa este cliente aplica as regras de visibilidade por conta
 * própria (ex.: o resumo semanal só soma os gastos privados do próprio
 * destinatário). Nunca use em Server Actions, páginas ou no navegador: lá
 * vale o cliente com a sessão (`createSupabaseServerClient`).
 *
 * Aceita a chave nova (SUPABASE_SECRET_KEY, "sb_secret_...") ou a antiga
 * (SUPABASE_SERVICE_ROLE_KEY). Sem chave, devolve null e a tarefa responde 503.
 */
export function criarClienteAdmin(): SupabaseClient | null {
  const admin = ambiente().supabaseAdmin;
  if (!admin) return null;
  return createClient(admin.url, admin.chaveSecreta, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** E-mail de cada conta, consultado sob demanda e guardado durante a tarefa. */
export function criarLeitorDeEmails(admin: SupabaseClient) {
  const memoria = new Map<string, Promise<string | null>>();
  return (userId: string): Promise<string | null> => {
    let pendente = memoria.get(userId);
    if (!pendente) {
      pendente = admin.auth.admin
        .getUserById(userId)
        .then(({ data, error }) => (error ? null : data.user?.email ?? null))
        .catch(() => null);
      memoria.set(userId, pendente);
    }
    return pendente;
  };
}

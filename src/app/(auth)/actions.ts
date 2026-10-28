"use server";

import { redirect } from "next/navigation";

/**
 * Server Actions de autenticação (BASE / placeholder).
 *
 * Decisão: a autenticação real (verificação de credenciais, criação de sessão,
 * persistência em base de dados) será ligada aqui futuramente. Por agora,
 * validamos presença mínima dos campos e redirecionamos para o dashboard,
 * mantendo o fluxo de navegação funcional para testes.
 */

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // TODO: validar credenciais contra a base de dados e criar sessão.
  if (!email || !password) {
    // Numa implementação real, devolveríamos estado de erro para o cliente.
    return;
  }

  redirect("/dashboard");
}

export async function registerAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // TODO: criar utilizador, hash de password e sessão inicial.
  if (!name || !email || !password) {
    return;
  }

  redirect("/dashboard");
}

"use server";

import { redirect } from "next/navigation";

/**
 * Server Actions de autenticação (BASE / placeholder).
 *
 * Decisão: a autenticação real (verificação de credenciais, criação de sessão,
 * persistência no banco de dados) será ligada aqui futuramente. Por enquanto,
 * validamos a presença mínima dos campos e redirecionamos para o dashboard,
 * mantendo o fluxo de navegação funcional para testes.
 */

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // TODO: validar credenciais no banco de dados e criar sessão.
  if (!email || !password) {
    // Numa implementação real, retornaríamos estado de erro para o cliente.
    return;
  }

  redirect("/dashboard");
}

export async function registerAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // TODO: criar usuário, hash da senha e sessão inicial.
  if (!name || !email || !password) {
    return;
  }

  redirect("/dashboard");
}

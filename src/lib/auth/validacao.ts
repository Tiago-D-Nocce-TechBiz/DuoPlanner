import { z } from "zod";

/**
 * Validação dos formulários de acesso (pura, testável).
 *
 * - E-mail com formato real, normalizado (trim + minúsculas).
 * - Senha até 72 caracteres: o limite do bcrypt usado pelo Supabase Auth
 *   (acima disso, o resto seria ignorado em silêncio).
 * - Cadastro: 8+ caracteres, com letra e número.
 *
 * As mensagens nunca dizem se um e-mail já tem conta (anti-enumeração).
 */

const MAX_SENHA = 72;

const email = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail longo demais.")
  .pipe(z.email({ error: "Informe um e-mail válido (ex.: nome@email.com)." }));

/** Campo opcional de texto do FormData ("" quando ausente). */
const opcional = (max: number) => z.string().trim().max(max).catch("");

export const esquemaLogin = z.object({
  email,
  senha: z
    .string({ error: "Informe a senha." })
    .min(1, "Informe a senha.")
    .max(MAX_SENHA, "Senha longa demais."),
  redirect: opcional(200),
  codigoConvite: opcional(64),
});

export const esquemaCadastro = z.object({
  nome: opcional(80),
  email,
  senha: z
    .string({ error: "Informe uma senha." })
    .min(8, "A senha deve ter pelo menos 8 caracteres.")
    .max(MAX_SENHA, `Use no máximo ${MAX_SENHA} caracteres na senha.`)
    .regex(/[A-Za-z]/, "Use ao menos uma letra e um número na senha.")
    .regex(/\d/, "Use ao menos uma letra e um número na senha."),
  codigoConvite: opcional(64),
});

export type DadosLogin = z.infer<typeof esquemaLogin>;
export type DadosCadastro = z.infer<typeof esquemaCadastro>;

/** Lê um campo de texto do FormData (File e ausência viram undefined). */
export function campoTexto(formData: FormData, ...nomes: string[]): string | undefined {
  for (const nome of nomes) {
    const valor = formData.get(nome);
    if (typeof valor === "string") return valor;
  }
  return undefined;
}

/** Primeira mensagem legível de um erro do zod. */
export function primeiraMensagem(erro: z.ZodError, padrao = "Confira os dados informados."): string {
  return erro.issues[0]?.message ?? padrao;
}

/**
 * Resposta do cadastro, igual para e-mail novo e já cadastrado: quem tenta
 * descobrir se um e-mail tem conta não recebe essa informação.
 */
export function mensagemCadastroNeutra(comConvite: boolean): string {
  return comConvite
    ? "Pronto! Se este e-mail puder ser usado, enviamos um link de confirmação. Confirme e depois entre: o convite será aplicado no primeiro acesso."
    : "Pronto! Se este e-mail puder ser usado, enviamos um link de confirmação. Confira a caixa de entrada (e o spam) e depois entre.";
}

/** O Supabase recusou o cadastro porque o e-mail já existe. */
export function erroEmailJaCadastrado(mensagem: string): boolean {
  return /already (been )?registered|user already exists|email_exists/i.test(mensagem);
}

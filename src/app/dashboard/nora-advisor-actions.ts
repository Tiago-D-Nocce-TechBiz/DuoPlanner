"use server";

import { z } from "zod";
import { withAuthAction } from "@/lib/acoes/com-sessao";
import { consultarAdvisor } from "@/lib/ai/nora-advisor";
import { ESTRATEGIA_IDS, type ResultadoAdvisor } from "@/lib/ai/nora-strategies";

/**
 * Ferramentas de economia e auditoria da Nora (`/auditar-voo`,
 * `/verificar-taxas`...). Sessão por `getClaims()` (`withAuthAction`), entrada
 * validada, cota "ia" por usuário (só quando a IA é de fato chamada) e prazo
 * de 12 s na chamada ao Gemini. O contexto da viagem vem sozinho do
 * workspace; o texto é só um complemento opcional do casal.
 *
 * Nunca devolve falha por IA fora do ar: cai na lista de conferência local
 * (ver `consultarAdvisor`). Só falha por sessão, entrada inválida e erro
 * interno.
 */
const entrada = z.object({
  estrategia: z.enum(ESTRATEGIA_IDS, { error: "Ferramenta desconhecida." }),
  texto: z.string().trim().max(600, "Texto grande demais (até 600 caracteres).").default(""),
});

export const consultarNora = withAuthAction(
  "consultarNora",
  entrada,
  async (dados, { sessao }): Promise<ResultadoAdvisor> => consultarAdvisor(dados, sessao)
);

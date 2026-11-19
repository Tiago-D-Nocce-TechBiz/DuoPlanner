"use server";

import { withAuthAction } from "@/lib/acoes/com-sessao";
import { curarRoteiro, entradaCuradoriaSchema } from "@/lib/ai/roteiro-curadoria";
import type { ResultadoCuradoria } from "@/lib/roteiro/tipos";

/**
 * Curadoria da Nora para a planilha do roteiro. A planilha é lida no
 * navegador; aqui chegam só as atividades já interpretadas (texto curto, com
 * teto) e, no máximo, o que a Nora sugere volta. Nada é gravado: quem grava
 * (depois de a pessoa revisar a prévia) é o motor de sincronização, no
 * workspace da sessão.
 *
 * Sessão por `getClaims()` (`withAuthAction`), entrada validada com zod, cota
 * "ia" por usuário (só quando o Gemini é de fato chamado) e prazo de 12 s.
 * IA fora do ar, sem chave ou sem cota NÃO é falha: volta o resultado
 * "local" com o aviso, e a tela organiza a planilha sozinha.
 */
export const curarRoteiroImportado = withAuthAction(
  "curarRoteiroImportado",
  entradaCuradoriaSchema,
  async (dados, { sessao }): Promise<ResultadoCuradoria> => curarRoteiro(dados, sessao)
);

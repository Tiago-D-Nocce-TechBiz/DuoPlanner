import type { ResultadoAcao } from "@/lib/acoes/resultado";
import type { EntradaCuradoria, ResultadoCuradoria } from "./tipos";

type Curar = (entrada: EntradaCuradoria) => Promise<ResultadoAcao<ResultadoCuradoria>>;

const SEM_CURADORIA = (aviso: string): ResultadoCuradoria => ({ origem: "local", aviso, classificacoes: [], sugestoes: [] });

/**
 * Pede a curadoria à Server Action (o código só baixa no primeiro uso). Sem
 * conexão, sem login ou com a ação falhando, devolve o resultado "local": a
 * planilha é organizada pelo próprio aparelho, sem sugestões e sem gastar
 * cota. Nunca lança.
 */
export async function pedirCuradoria(entrada: EntradaCuradoria, curar?: Curar): Promise<ResultadoCuradoria> {
  try {
    const executar = curar ?? (await import("@/app/dashboard/roteiro-import-actions")).curarRoteiroImportado;
    const r = await executar(entrada);
    if (r.success) return r.data;
    return SEM_CURADORIA(
      r.code === "NAO_AUTENTICADO"
        ? "Entre na sua conta para a Nora sugerir lugares. Organizei a planilha sem sugestões."
        : `${r.error} Organizei a planilha sem sugestões.`
    );
  } catch {
    return SEM_CURADORIA("Sem conexão com a Nora agora. Organizei a planilha neste aparelho, sem sugestões.");
  }
}

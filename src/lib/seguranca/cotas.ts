import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { funcaoRpcAusente } from "@/lib/auth/seguranca";
import {
  LIMITES_COTA,
  mensagemCotaExcedida,
  registrarUso,
  segundosAte,
  type EstadoJanela,
  type RecursoCota,
} from "./cotas-regras";

/**
 * Cota de uso por usuário (rate limit) para as rotas e actions pagas.
 *
 * Contagem oficial: RPC `consumir_cota` no Postgres (janela fixa, atômica,
 * válida entre instâncias). Se a RPC ainda não existe (migration pendente),
 * caímos num limitador em memória por instância — melhor que nada, e o log
 * avisa. Se o banco falha por outro motivo, NEGAMOS (fail-closed): é mais
 * barato recusar uma busca do que pagar por abuso.
 */

export type ResultadoCota =
  | { permitido: true; restante: number }
  | {
      permitido: false;
      motivo: "limite" | "indisponivel";
      mensagem: string;
      reiniciaEm: Date | null;
    };

const emMemoria = new Map<string, EstadoJanela>();
const MAX_CHAVES_EM_MEMORIA = 5000;
let avisouFallback = false;

function consumirEmMemoria(userId: string, recurso: RecursoCota): ResultadoCota {
  const { limite, janelaSegundos } = LIMITES_COTA[recurso];
  if (emMemoria.size > MAX_CHAVES_EM_MEMORIA) emMemoria.clear();
  const chave = `${userId}:${recurso}`;
  const estado = registrarUso(emMemoria.get(chave), Date.now(), janelaSegundos);
  emMemoria.set(chave, estado);
  if (estado.contador <= limite) {
    return { permitido: true, restante: limite - estado.contador };
  }
  const reiniciaEm = new Date(estado.inicioMs + janelaSegundos * 1000);
  return {
    permitido: false,
    motivo: "limite",
    reiniciaEm,
    mensagem: mensagemCotaExcedida(recurso, reiniciaEm),
  };
}

export async function consumirCota(
  supabase: SupabaseClient,
  userId: string,
  recurso: RecursoCota
): Promise<ResultadoCota> {
  const { limite, janelaSegundos } = LIMITES_COTA[recurso];
  const { data, error } = await supabase.rpc("consumir_cota", {
    p_recurso: recurso,
    p_limite: limite,
    p_janela_segundos: janelaSegundos,
  });

  if (!error) {
    const linha = (Array.isArray(data) ? data[0] : data) as
      | { permitido?: boolean; restante?: number; reinicia_em?: string }
      | null
      | undefined;
    if (linha?.permitido) {
      return { permitido: true, restante: Number(linha.restante ?? 0) };
    }
    const reiniciaEm = linha?.reinicia_em
      ? new Date(linha.reinicia_em)
      : new Date(Date.now() + janelaSegundos * 1000);
    return {
      permitido: false,
      motivo: "limite",
      reiniciaEm,
      mensagem: mensagemCotaExcedida(recurso, reiniciaEm),
    };
  }

  if (funcaoRpcAusente(error)) {
    if (!avisouFallback) {
      avisouFallback = true;
      console.warn(
        "[cotas] RPC consumir_cota ausente: usando limite em memória por instância. Aplique a migration de endurecimento."
      );
    }
    return consumirEmMemoria(userId, recurso);
  }

  console.error("[cotas] falha ao verificar a cota:", error.message);
  return {
    permitido: false,
    motivo: "indisponivel",
    reiniciaEm: null,
    mensagem: "Não foi possível verificar seu limite de uso agora. Tente de novo em instantes.",
  };
}

/** Resposta HTTP para cota negada (429 com Retry-After, ou 503). */
export function respostaCotaNegada(
  resultado: Extract<ResultadoCota, { permitido: false }>
): NextResponse {
  if (resultado.motivo === "indisponivel") {
    return NextResponse.json(
      { error: resultado.mensagem, code: "COTA_INDISPONIVEL" },
      { status: 503 }
    );
  }
  const retryAfter = resultado.reiniciaEm ? segundosAte(resultado.reiniciaEm) : 60;
  return NextResponse.json(
    { error: resultado.mensagem, code: "COTA_EXCEDIDA" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

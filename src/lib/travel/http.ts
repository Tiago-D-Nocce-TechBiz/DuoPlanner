import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { SearchErrorBody } from "./types";

/** 400 com a primeira mensagem legível e os erros por campo. */
export function invalidParamsResponse(error: z.ZodError) {
  return NextResponse.json<SearchErrorBody>(
    {
      error: error.issues[0]?.message ?? "Parâmetros inválidos.",
      code: "INVALID_PARAMS",
      issues: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
    },
    { status: 400 }
  );
}

export function notConfiguredResponse(
  code: "KIWI_NOT_CONFIGURED" | "BOOKING_NOT_CONFIGURED",
  message: string
) {
  return NextResponse.json<SearchErrorBody>({ error: message, code }, { status: 503 });
}

/**
 * Traduz falhas do provedor. Erros de credencial (401/403) viram 502: o
 * problema é a configuração do servidor, não a requisição do usuário.
 */
export function upstreamErrorResponse(status: number, message: string) {
  if (status === 404) {
    return NextResponse.json<SearchErrorBody>(
      { error: message, code: "NOT_FOUND" },
      { status: 404 }
    );
  }
  if (status === 429) {
    return NextResponse.json<SearchErrorBody>(
      { error: message, code: "RATE_LIMITED" },
      { status: 429 }
    );
  }
  console.error(`[busca] provedor respondeu ${status}: ${message}`);
  return NextResponse.json<SearchErrorBody>(
    { error: message, code: "UPSTREAM_ERROR" },
    { status: status === 503 || status === 504 ? status : 502 }
  );
}

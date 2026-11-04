"use client";

import { useActionState } from "react";
import Link from "next/link";
import { aceitarConviteAction } from "@/app/(auth)/actions";

/** Botão de aceite: POST explícito (Server Action, com checagem de Origin). */
export function AceitarConviteForm({ codigo }: { codigo: string }) {
  const [estado, enviar, pendente] = useActionState(aceitarConviteAction, undefined);

  return (
    <form action={enviar} className="mt-6">
      <input type="hidden" name="codigo" value={codigo} />
      {estado?.erro && (
        <p role="alert" className="mb-3 text-xs font-medium text-[var(--color-danger)]">
          {estado.erro}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
        >
          {pendente ? "Vinculando…" : "Aceitar convite"}
        </button>
        <Link href="/dashboard" className="px-4 py-2.5 rounded-xl text-sm font-semibold glass-panel">
          Agora não
        </Link>
      </div>
    </form>
  );
}

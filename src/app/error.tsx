"use client";

import { PainelErro } from "@/components/ui/painel-erro";

/**
 * Erro nas telas públicas (início, login, convite, termos) e no layout do
 * painel. O layout raiz continua (fontes e tema); o erro só troca o conteúdo.
 */
export default function ErroDaPagina({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <PainelErro
        error={error}
        retry={retry}
        titulo="Algo deu errado por aqui"
        descricao="Tivemos um problema ao carregar esta página. Tente de novo em instantes."
        destino={{ href: "/", rotulo: "Voltar ao início" }}
      />
    </main>
  );
}

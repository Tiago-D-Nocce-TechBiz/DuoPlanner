"use client";

import { PainelErro } from "@/components/ui/painel-erro";

/**
 * Erro numa tela do painel. Fica dentro do layout do painel: o menu e o
 * cabeçalho continuam, então dá para ir a outra tela. As alterações já feitas
 * estão na fila do aparelho e continuam sincronizando.
 */
export default function ErroDoPainel({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="py-10">
      <PainelErro
        error={error}
        retry={retry}
        titulo="Esta tela não carregou"
        descricao="Tivemos um problema ao montar esta parte do painel. O que vocês já salvaram continua guardado e sincronizando. Tente de novo ou abra outra tela pelo menu."
        destino={{ href: "/dashboard", rotulo: "Ir para a visão geral" }}
      />
    </div>
  );
}

"use client";

import { ReceiptScanner, type GastoDoRecibo } from "@/components/financas/receipt-scanner";
import { useCotacoes } from "@/lib/cambio/use-cotacoes";
import { criarDespesa } from "@/lib/finance/store";

/** Leitura de recibo/Pix pela IA, com confirmação, gravando na fila do casal. */
export function ReciboDuoFinance() {
  const { taxas } = useCotacoes();

  const confirmar = (g: GastoDoRecibo) => {
    criarDespesa({
      descricao: g.descricao,
      valor: g.valor,
      moeda: g.moeda,
      cotacaoBrl: g.cotacaoBrl,
      data: g.data,
      categoria: g.categoria,
      escopo: g.escopo,
      origem: "recibo",
    });
  };

  return <ReceiptScanner onConfirmar={confirmar} taxas={taxas} />;
}

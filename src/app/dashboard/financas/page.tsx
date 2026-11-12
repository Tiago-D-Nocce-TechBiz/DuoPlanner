import type { Metadata } from "next";
import Link from "next/link";
import { FormularioGasto } from "@/components/finance/formulario-gasto";
import { ListaGastos } from "@/components/finance/lista-gastos";
import { ReciboDuoFinance } from "@/components/finance/recibo-duofinance";
import { ResumoFinancas } from "@/components/finance/resumo-financas";
import { SmartInvoiceImporter } from "@/components/finance/smart-invoice-importer";
import { Handshake } from "@/components/ui/icons";

export const metadata: Metadata = { title: "DuoFinance — DuoPlanner" };

/**
 * DuoFinance — o módulo financeiro do casal, sincronizado entre os dois.
 *
 * Página de servidor (cabeçalho estático) com ilhas cliente independentes:
 * resumo, importador de fatura, leitura de recibo, formulário e lista. Cada
 * uma tem o próprio estado, então digitar no formulário ou revisar uma fatura
 * longa não renderiza as demais.
 *
 * Cada gasto é salvo no Postgres (`despesas_viagem`, com fila offline e
 * Realtime): o que é marcado como da viagem aparece na hora para o par e entra
 * no Acerto de Contas; o pessoal fica privado (a RLS não o entrega ao par).
 */
export default function FinancasPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">DuoFinance</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)] max-w-2xl">
            Importe a fatura do cartão para ver tudo separado (à vista, parcelado e por categoria), leia um recibo ou lance
            manualmente. Os gastos da viagem aparecem na hora para vocês dois e entram no acerto; os pessoais ficam privados.
          </p>
        </div>
        <Link
          href="/dashboard/acerto"
          className="self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Handshake className="h-4 w-4" />
          Acerto de contas
        </Link>
      </div>

      <ResumoFinancas />

      {/* Motor de importação de faturas (revisão antes de salvar) */}
      <SmartInvoiceImporter />

      <ReciboDuoFinance />

      <FormularioGasto />

      <ListaGastos />
    </div>
  );
}

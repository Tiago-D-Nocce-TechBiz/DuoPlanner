"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { todayInSaoPaulo } from "@/lib/dates";
import { sumMoney } from "@/lib/finance/money";
import { criarDespesa } from "@/lib/finance/store";
import { formatarReais, lerCustoDigitado } from "@/lib/roteiro/apresentacao";
import { montarLancamentos, type EscopoLancamento, type PedidoNaTela } from "@/lib/roteiro/lancamento";
import { getContexto } from "@/lib/sync/motor";

/**
 * Confirmação do envio de custos estimados do Roteiro para o DuoFinance.
 * Nada é lançado antes do botão "Confirmar lançamento". Com uma só atividade,
 * o valor pode ser ajustado (estimativa vira o gasto real); com o dia
 * inteiro, cada atividade vira um gasto, com o valor estimado. O id de cada
 * gasto é fixo (ver `lancamento.ts`): confirmar duas vezes não duplica.
 */
export function ConfirmarLancamento({ pedido, aoFechar }: { pedido: PedidoNaTela; aoFechar: () => void }) {
  const ctx = getContexto();
  const temEspaco = Boolean(ctx?.workspace);
  const unico = pedido.itens.length === 1;
  const [escopo, setEscopo] = useState<EscopoLancamento>(temEspaco ? "compartilhado" : "privado");
  const [valorTexto, setValorTexto] = useState(String(pedido.itens[0]?.valor ?? "").replace(".", ","));
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<number | null>(null);

  const itens = unico
    ? pedido.itens.map((i) => ({ ...i, valor: lerCustoDigitado(valorTexto) ?? 0 }))
    : pedido.itens;
  const total = sumMoney(itens.map((i) => i.valor));

  function confirmar() {
    const userId = ctx?.userId;
    if (!userId) {
      setErro("O espaço do casal ainda está carregando. Tente de novo em instantes.");
      return;
    }
    if (unico && (lerCustoDigitado(valorTexto) ?? 0) <= 0) {
      setErro("Informe um valor maior que zero (ex.: 120,00).");
      return;
    }
    const lancamentos = montarLancamentos({
      itens: itens.map((i) => ({ item: i, valor: i.valor })),
      escopo,
      dataDoDia: pedido.dataDoDia,
      hojeIso: todayInSaoPaulo(),
      destino: pedido.destino,
      userId,
    });
    let criados = 0;
    for (const l of lancamentos) if (criarDespesa(l)) criados++;
    if (criados === 0) {
      setErro("Não consegui lançar agora. Tente de novo em instantes.");
      return;
    }
    setErro(null);
    setFeito(criados);
  }

  return (
    <Modal open onClose={aoFechar} title="Lançar nas Finanças">
      {feito !== null ? (
        <div role="status" data-lancamento-feito className="space-y-3 text-sm text-[var(--color-heading)]">
          <p>
            {feito} {feito === 1 ? "gasto lançado" : "gastos lançados"} no DuoFinance ({escopo === "compartilhado" ? "compartilhado com a dupla" : "só seu"}).
          </p>
          <div className="flex gap-2">
            <Link href="/dashboard/financas" className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[var(--color-accent-foreground)]">
              Ver no DuoFinance
            </Link>
            <button type="button" onClick={aoFechar} className="rounded-xl px-4 py-2 text-xs font-medium text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer">
              Fechar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-muted)]">
            {unico ? `“${pedido.rotulo}”` : `${pedido.rotulo}: ${pedido.itens.length} atividades`}. O custo é uma estimativa; confira o valor antes de confirmar.
          </p>

          {unico ? (
            <label className="block text-xs text-[var(--color-muted)]">
              Valor (R$)
              <input
                type="text"
                inputMode="decimal"
                aria-label="Valor do gasto em reais"
                value={valorTexto}
                onChange={(e) => setValorTexto(e.target.value)}
                className="glass-input mt-1"
              />
            </label>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {pedido.itens.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span className="truncate text-[var(--color-heading)]">{i.titulo || "Atividade"}</span>
                  <span className="shrink-0 text-[var(--color-muted)]">{formatarReais(i.valor)}</span>
                </li>
              ))}
            </ul>
          )}

          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs text-[var(--color-muted)]">De quem é o gasto</legend>
            <label className="flex items-start gap-2 text-sm text-[var(--color-heading)]">
              <input type="radio" name="escopo-lancamento" checked={escopo === "compartilhado"} disabled={!temEspaco} onChange={() => setEscopo("compartilhado")} className="mt-1" />
              <span>
                Compartilhado com a dupla
                <span className="block text-xs text-[var(--color-muted)]">Entra no acerto de contas. {temEspaco ? "" : "Disponível quando o espaço do casal estiver pronto."}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-[var(--color-heading)]">
              <input type="radio" name="escopo-lancamento" checked={escopo === "privado"} onChange={() => setEscopo("privado")} className="mt-1" />
              <span>
                Só meu
                <span className="block text-xs text-[var(--color-muted)]">Fica privado: o par não vê.</span>
              </span>
            </label>
          </fieldset>

          <p className="text-sm text-[var(--color-heading)]">
            Total: <strong>{formatarReais(total)}</strong>
          </p>
          {erro && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {erro}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={aoFechar} className="rounded-xl px-4 py-2 text-xs font-medium text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer">
              Cancelar
            </button>
            <button type="button" onClick={confirmar} className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[var(--color-accent-foreground)] cursor-pointer">
              Confirmar lançamento
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

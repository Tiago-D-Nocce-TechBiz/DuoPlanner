"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QualCartaoUsar } from "@/components/cambio/qual-cartao-usar";
import { Shuffle } from "@/components/ui/icons";
import { parseValorMonetario } from "@/lib/finance/importar";

/**
 * Conversor de Moedas.
 *
 * Abre com taxas de REFERÊNCIA (iguais no servidor e no cliente, sem
 * hydration mismatch) e, depois de montar, busca a cotação do dia em
 * `/api/cotacoes` (AwesomeAPI, cache de 1 hora). Sem rede, continua com as
 * referências. O usuário pode ajustar qualquer taxa; o que ele editou não é
 * sobrescrito pela cotação. Embaixo, "Qual cartão usar?" compara o custo real
 * (VET) de cartão, conta global e espécie com as mesmas taxas. 100% em PT-BR.
 */

// 1 unidade da moeda = X reais. Ponto de partida até a cotação chegar.
const MOEDAS: { codigo: string; nome: string; emReais: number }[] = [
  { codigo: "BRL", nome: "Real", emReais: 1 },
  { codigo: "USD", nome: "Dólar americano", emReais: 5.4 },
  { codigo: "EUR", nome: "Euro", emReais: 5.9 },
  { codigo: "GBP", nome: "Libra", emReais: 6.9 },
  { codigo: "ARS", nome: "Peso argentino", emReais: 0.0055 },
  { codigo: "CLP", nome: "Peso chileno", emReais: 0.0057 },
];

type Cotacao =
  | { estado: "carregando" }
  | { estado: "ao-vivo"; de: string; ate: string; fonte: string }
  | { estado: "referencia"; mensagem: string };

interface RespostaCotacoes {
  ok: boolean;
  taxas?: Record<string, number>;
  atualizadoDe?: string;
  atualizadoAte?: string;
  fonte?: string;
  mensagem?: string;
}

/** "2026-10-30 19:00:08" → "30/10/2026 às 19:00". */
function formatarMomento(bruto: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(bruto);
  return m ? `${m[3]}/${m[2]}/${m[1]} às ${m[4]}:${m[5]}` : bruto;
}

export default function ConversorPage() {
  const [valor, setValor] = useState("100");
  const [de, setDe] = useState("USD");
  const [para, setPara] = useState("BRL");
  const [taxas, setTaxas] = useState<Record<string, number>>(() =>
    Object.fromEntries(MOEDAS.map((m) => [m.codigo, m.emReais]))
  );
  // Moedas cuja taxa o usuário editou: a cotação ao vivo não as sobrescreve.
  const editadasRef = useRef(new Set<string>());
  const [cotacao, setCotacao] = useState<Cotacao>({ estado: "carregando" });

  // Cotação do dia, uma vez após montar.
  useEffect(() => {
    let ativo = true;
    fetch("/api/cotacoes", { headers: { accept: "application/json" } })
      .then((res) => res.json())
      .then((dados: RespostaCotacoes) => {
        if (!ativo) return;
        if (!dados.ok || !dados.taxas) {
          setCotacao({ estado: "referencia", mensagem: dados.mensagem ?? "Cotação ao vivo indisponível agora." });
          return;
        }
        const vivas = dados.taxas;
        const editadas = editadasRef.current;
        setTaxas((atuais) => {
          const proximas = { ...atuais };
          for (const [codigo, taxa] of Object.entries(vivas)) {
            if (!editadas.has(codigo) && Number.isFinite(taxa) && taxa > 0) proximas[codigo] = taxa;
          }
          return proximas;
        });
        setCotacao({
          estado: "ao-vivo",
          de: dados.atualizadoDe ?? "",
          ate: dados.atualizadoAte ?? dados.atualizadoDe ?? "",
          fonte: dados.fonte ?? "AwesomeAPI",
        });
      })
      .catch(() => {
        if (ativo) setCotacao({ estado: "referencia", mensagem: "Cotação ao vivo indisponível agora." });
      });
    return () => {
      ativo = false;
    };
  }, []);

  const resultado = useMemo(() => {
    const v = parseValorMonetario(valor) ?? 0;
    const reais = v * (taxas[de] ?? 0);
    return reais / (taxas[para] || 1);
  }, [valor, de, para, taxas]);

  const inverter = () => {
    setDe(para);
    setPara(de);
  };

  const editarTaxa = (codigo: string, bruto: string) => {
    editadasRef.current.add(codigo);
    setTaxas((prev) => ({ ...prev, [codigo]: parseFloat(bruto) || 0 }));
  };

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const periodo =
    cotacao.estado === "ao-vivo"
      ? cotacao.de === cotacao.ate
        ? `de ${formatarMomento(cotacao.de)}`
        : `atualizada entre ${formatarMomento(cotacao.de)} e ${formatarMomento(cotacao.ate)}`
      : "";
  const legenda =
    cotacao.estado === "carregando"
      ? "Buscando a cotação do dia…"
      : cotacao.estado === "ao-vivo"
        ? `Cotação de compra ${periodo} (fonte: ${cotacao.fonte}). Ajuste se quiser simular outra taxa.`
        : `${cotacao.mensagem} Usando valores de referência; ajuste conforme a cotação do dia.`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          Conversor de Moedas
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Converta valores entre moedas para planejar os gastos da viagem.
        </p>
      </div>

      {/* Conversor */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">Valor em</label>
            <div className="flex gap-2">
              <input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" className="glass-input" placeholder="100" />
              <select value={de} onChange={(e) => setDe(e.target.value)} className="glass-input sm:max-w-[120px]">
                {MOEDAS.map((m) => (
                  <option key={m.codigo} value={m.codigo}>{m.codigo}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={inverter}
            aria-label="Inverter moedas"
            className="flex h-11 w-11 self-end items-center justify-center rounded-xl glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer text-[var(--color-heading)]"
          >
            <Shuffle className="h-4 w-4" />
          </button>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">Convertido para</label>
            <select value={para} onChange={(e) => setPara(e.target.value)} className="glass-input">
              {MOEDAS.map((m) => (
                <option key={m.codigo} value={m.codigo}>{m.nome}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
            {fmt(resultado)} <span className="text-lg text-[var(--color-muted)]">{para}</span>
          </p>
        </div>
      </div>

      {/* Taxas */}
      <div className="glass-panel rounded-2xl p-6">
        <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Taxas usadas na conversão</h2>
        <p role="status" className="mt-1 text-xs text-[var(--color-muted)]">
          {legenda}
        </p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MOEDAS.filter((m) => m.codigo !== "BRL").map((m) => (
            <div key={m.codigo} className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2">
              <span className="text-sm text-[var(--color-foreground)] flex-1">1 {m.codigo} =</span>
              <input
                type="number"
                step="any"
                min="0"
                value={taxas[m.codigo]}
                onChange={(e) => editarTaxa(m.codigo, e.target.value)}
                aria-label={`Taxa de ${m.nome} em reais`}
                className="glass-input max-w-[120px] text-right"
              />
              <span className="text-xs text-[var(--color-muted)]">R$</span>
            </div>
          ))}
        </div>
      </div>

      <QualCartaoUsar taxas={taxas} moedas={MOEDAS.filter((m) => m.codigo !== "BRL")} />
    </div>
  );
}

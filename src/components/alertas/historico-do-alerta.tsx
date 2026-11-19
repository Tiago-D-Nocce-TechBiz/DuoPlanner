"use client";

import { useEffect, useState } from "react";
import { geometriaDoGrafico, resumirHistorico, type PontoPreco, type Tendencia } from "@/lib/alertas/historico";
import { isoToBR } from "@/lib/dates";

/**
 * Histórico de preços de um Alerta: gráfico (SVG, sem biblioteca), menor
 * preço já visto, variação desde a primeira verificação e dias no alvo. A
 * série vem da Server Action `historicoDoAlerta` (sessão por `getClaims()`,
 * RLS por espaço) e só é buscada quando a pessoa abre o histórico.
 */
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ROTULO_TENDENCIA: Record<Tendencia, string> = {
  caindo: "Caindo (bom sinal)",
  subindo: "Subindo",
  estavel: "Estável",
};

type Resposta = { tentativa: number; resultado: { ok: true; pontos: PontoPreco[] } | { ok: false; mensagem: string } };

const LARGURA = 320;
const ALTURA = 120;

export function HistoricoDoAlerta({ alertaId, precoAlvo }: { alertaId: string; precoAlvo: number | null }) {
  const [tentativa, setTentativa] = useState(0);
  const [resposta, setResposta] = useState<Resposta | null>(null);

  useEffect(() => {
    let vivo = true;
    (async (): Promise<Resposta["resultado"]> => {
      try {
        const { historicoDoAlerta } = await import("@/app/dashboard/historico-alertas-actions");
        const r = await historicoDoAlerta({ alertaId });
        return r.success ? { ok: true, pontos: r.data.pontos } : { ok: false, mensagem: r.error };
      } catch {
        return { ok: false, mensagem: "Sem conexão agora. O histórico aparece quando a internet voltar." };
      }
    })().then((resultado) => {
      if (vivo) setResposta({ tentativa, resultado });
    });
    return () => {
      vivo = false;
    };
  }, [alertaId, tentativa]);

  if (!resposta || resposta.tentativa !== tentativa) {
    return (
      <p role="status" className="mt-3 text-xs text-[var(--color-muted)]">
        Carregando o histórico…
      </p>
    );
  }
  if (!resposta.resultado.ok) {
    return (
      <div role="alert" className="mt-3 space-y-2 text-xs text-[var(--color-muted)]">
        <p>{resposta.resultado.mensagem}</p>
        <button type="button" onClick={() => setTentativa((t) => t + 1)} className="rounded-lg px-3 py-1.5 font-semibold glass-panel cursor-pointer">
          Tentar de novo
        </button>
      </div>
    );
  }

  const pontos = resposta.resultado.pontos;
  const resumo = resumirHistorico(pontos, precoAlvo);
  if (!resumo) {
    return (
      <p data-historico-vazio className="mt-3 text-xs text-[var(--color-muted)]">
        Ainda sem histórico. O primeiro preço entra na próxima verificação diária (todo dia, por volta das 8h de Brasília).
      </p>
    );
  }
  const g = geometriaDoGrafico(pontos, precoAlvo, LARGURA, ALTURA);
  const ultimo = g.pontos[g.pontos.length - 1];
  const doMenor = g.pontos.find((p) => p.dia === resumo.menor.dia);

  return (
    <section data-historico-preco aria-label="Histórico de preços" className="mt-3 space-y-3 border-t border-[var(--color-border)] pt-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div>
          <dt className="text-[var(--color-muted)]">Hoje</dt>
          <dd className="font-semibold text-[var(--color-heading)]">{brl(resumo.atual.preco)}</dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Menor preço visto</dt>
          <dd className="font-semibold text-[var(--color-heading)]">
            {brl(resumo.menor.preco)} <span className="font-normal text-[var(--color-muted)]">em {isoToBR(resumo.menor.dia)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Desde a 1ª verificação</dt>
          <dd className="font-semibold text-[var(--color-heading)]">
            {resumo.variacaoPct === null ? "—" : `${resumo.variacaoPct > 0 ? "+" : ""}${resumo.variacaoPct.toLocaleString("pt-BR")}%`}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--color-muted)]">Tendência</dt>
          <dd className="font-semibold text-[var(--color-heading)]">{resumo.quantidade > 1 ? ROTULO_TENDENCIA[resumo.tendencia] : "Só 1 verificação"}</dd>
        </div>
      </dl>
      {resumo.noMenorPreco && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">O preço de hoje é o menor já visto neste alerta.</p>
      )}
      {precoAlvo !== null && (
        <p className="text-xs text-[var(--color-muted)]">
          {resumo.diasNoAlvo === 0 ? "Ainda não chegou ao alvo." : `No alvo ou abaixo em ${resumo.diasNoAlvo} ${resumo.diasNoAlvo === 1 ? "dia" : "dias"}.`}
        </p>
      )}
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label={`Gráfico de preços: de ${brl(resumo.primeiro.preco)} em ${isoToBR(resumo.primeiro.dia)} a ${brl(resumo.atual.preco)} em ${isoToBR(resumo.atual.dia)}; menor ${brl(resumo.menor.preco)}.`}
        className="h-auto w-full"
      >
        {g.alvoY !== null && (
          <g className="text-emerald-500">
            <line x1="0" x2={LARGURA} y1={g.alvoY} y2={g.alvoY} stroke="currentColor" strokeDasharray="4 4" strokeWidth="1" />
            <text x={LARGURA - 2} y={g.alvoY - 3} textAnchor="end" fontSize="9" fill="currentColor">
              alvo {brl(precoAlvo ?? 0)}
            </text>
          </g>
        )}
        <g className="text-blue-500">
          {g.pontos.length > 1 && <polygon points={g.area} fill="currentColor" opacity="0.1" />}
          {g.pontos.length > 1 && <polyline points={g.linha} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          <circle cx={ultimo.x} cy={ultimo.y} r="4" fill="currentColor" />
        </g>
        {doMenor && doMenor.dia !== ultimo.dia && <circle cx={doMenor.x} cy={doMenor.y} r="4" className="text-emerald-500" fill="currentColor" />}
      </svg>
      <table className="sr-only">
        <caption>Últimos preços verificados</caption>
        <thead>
          <tr>
            <th>Dia</th>
            <th>Preço</th>
          </tr>
        </thead>
        <tbody>
          {pontos.slice(-10).map((p) => (
            <tr key={p.dia}>
              <td>{isoToBR(p.dia)}</td>
              <td>{brl(p.preco)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, CheckCircle2, Lightbulb, ShieldCheck } from "@/components/ui/icons";
import { todayInSaoPaulo } from "@/lib/dates";
import {
  estrategiaPorId,
  temEstimativaEmReais,
  type Gravidade,
  type ResultadoAdvisor,
  type Veredito,
} from "@/lib/ai/nora-strategies";
import { criarRegistro, getContexto, getRegistros } from "@/lib/sync/motor";
import type { RoteiroDia, RoteiroItem } from "@/lib/sync/modelos";
import { cn } from "@/lib/utils";
import { alertaDaAnalise, dicaParaRoteiro } from "./nora-acoes-analise";
import { ICONES_DA_NORA } from "./nora-icones";

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const VEREDITO_VISUAL: Record<Veredito, { rotulo: string; classe: string }> = {
  RESERVE_AGORA: { rotulo: "Reserve agora", classe: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  ESPERE: { rotulo: "Espere", classe: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  MUDE_DE_PLANO: { rotulo: "Mude de plano", classe: "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300" },
};

const GRAVIDADE_VISUAL: Record<Gravidade, { Icone: typeof Lightbulb; classe: string; rotulo: string }> = {
  info: { Icone: Lightbulb, classe: "text-blue-500", rotulo: "Informação" },
  atencao: { Icone: AlertTriangle, classe: "text-amber-500", rotulo: "Atenção" },
  critico: { Icone: AlertTriangle, classe: "text-red-500", rotulo: "Crítico" },
};

function corDaNota(nota: number): string {
  if (nota >= 8) return "text-emerald-500";
  if (nota >= 5) return "text-amber-500";
  return "text-red-500";
}

function NotaEmAnel({ nota }: { nota: number }) {
  const raio = 18;
  const perimetro = 2 * Math.PI * raio;
  const preenchido = (Math.min(10, Math.max(0, nota)) / 10) * perimetro;
  return (
    <div
      role="img"
      aria-label={`Nota de custo-benefício: ${nota} de 10`}
      className={cn("relative h-12 w-12 shrink-0", corDaNota(nota))}
    >
      <svg viewBox="0 0 44 44" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="22" cy="22" r={raio} fill="none" strokeWidth="4" className="stroke-current opacity-20" />
        <circle
          cx="22"
          cy="22"
          r={raio}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${preenchido} ${perimetro}`}
          className="stroke-current"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[var(--color-heading)]">{nota}</span>
    </div>
  );
}

type ResultadoDeAnalise = Extract<ResultadoAdvisor, { tipo: "analise" }>;

type Estado = { tipo: "ocioso" } | { tipo: "feito"; texto: string } | { tipo: "erro"; texto: string; ajuda?: boolean };

/** Grava a dica como atividade no último dia do roteiro (cria um dia se não houver). */
function salvarDicaNoRoteiro(resultado: ResultadoDeAnalise): Estado {
  const ctx = getContexto();
  const ws = ctx?.workspace?.id ?? null;
  const userId = ctx?.userId ?? null;
  if (!ws || !userId) return { tipo: "erro", texto: "O espaço da dupla ainda está carregando. Tente de novo em instantes." };
  const agora = new Date().toISOString();
  const dias: RoteiroDia[] = getRegistros("roteiro_dias");
  let dia = [...dias].sort((a, b) => a.ordem - b.ordem || (a.data ?? "").localeCompare(b.data ?? "")).at(-1);
  if (!dia) {
    dia = { id: crypto.randomUUID(), workspaceId: ws, userId, data: null, ordem: 0, atualizadoEm: agora, atualizadoPor: userId };
    criarRegistro("roteiro_dias", dia);
  }
  const diaId = dia.id;
  const doDia = getRegistros("roteiro_itens").filter((i) => i.diaId === diaId);
  const { titulo, nota } = dicaParaRoteiro(estrategiaPorId(resultado.estrategia), resultado.analise, resultado.contexto.destino);
  const item: RoteiroItem = {
    id: crypto.randomUUID(),
    workspaceId: ws,
    diaId,
    horario: "",
    titulo,
    nota,
    ordem: doDia.reduce((max, i) => Math.max(max, i.ordem), -1) + 1,
    atualizadoEm: agora,
    atualizadoPor: userId,
  };
  criarRegistro("roteiro_itens", item);
  return { tipo: "feito", texto: "Dica salva no Roteiro." };
}

function criarAlertaDePreco(resultado: ResultadoDeAnalise): Estado {
  const ctx = getContexto();
  const userId = ctx?.userId ?? null;
  if (!userId) return { tipo: "erro", texto: "O espaço da dupla ainda está carregando. Tente de novo em instantes." };
  const r = alertaDaAnalise({
    contexto: resultado.contexto,
    analise: resultado.analise,
    userId,
    workspaceId: ctx?.workspace?.id ?? null,
    hojeIso: todayInSaoPaulo(),
    agoraIso: new Date().toISOString(),
    id: crypto.randomUUID(),
  });
  if (!r.ok) return { tipo: "erro", texto: r.motivo, ajuda: true };
  criarRegistro("alertas", r.alerta);
  return { tipo: "feito", texto: "Alerta de preço criado." };
}

/** Pergunta de volta, quando a Nora precisa de mais informação antes de analisar. */
function CartaoDePergunta({ pergunta }: { pergunta: string }) {
  return (
    <p data-nora-pergunta className="mt-2 rounded-xl border border-blue-400/30 bg-blue-500/5 px-3 py-2 text-sm">
      {pergunta}
    </p>
  );
}

export function CardAnalise({ resultado }: { resultado: ResultadoAdvisor }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "ocioso" });
  const [feitos, setFeitos] = useState<readonly string[]>([]);
  if (resultado.tipo === "pergunta") return <CartaoDePergunta pergunta={resultado.pergunta} />;

  const { analise, estrategia: id, origem } = resultado;
  const est = estrategiaPorId(id);
  const Icone = ICONES_DA_NORA[est.iconName];
  const veredito = analise.vereditoBadge ? VEREDITO_VISUAL[analise.vereditoBadge] : null;
  const mostrarRodapeHistorico = origem === "ia" || temEstimativaEmReais(analise);
  const executar = (acao: string, fn: (r: ResultadoDeAnalise) => Estado) => {
    const novo = fn(resultado);
    setEstado(novo);
    if (novo.tipo === "feito") setFeitos((f) => [...f, acao]);
  };

  return (
    <article
      data-nora-analise={id}
      data-origem={origem}
      aria-label={`Análise: ${est.label}`}
      className="mt-2 space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-elevated)] p-3 text-[13px]"
    >
      <header className="flex items-center gap-3">
        {analise.notaCustoBeneficio !== null ? (
          <NotaEmAnel nota={analise.notaCustoBeneficio} />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
            <Icone className="h-4 w-4 text-blue-500" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-sm font-semibold text-[var(--color-heading)]">{est.label}</h3>
          {veredito && (
            <span
              data-veredito={analise.vereditoBadge}
              className={cn("mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", veredito.classe)}
            >
              <CheckCircle2 className="h-3 w-3" />
              {veredito.rotulo}
            </span>
          )}
        </div>
        {origem === "local" && (
          <span className="shrink-0 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-muted)]">
            Lista de conferência
          </span>
        )}
      </header>

      {resultado.aviso && <p className="text-xs text-[var(--color-muted)]">{resultado.aviso}</p>}
      <p className="leading-relaxed">{analise.resumo}</p>

      {analise.economiaEstimada && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Economia estimada</p>
          <p className="text-base font-bold text-[var(--color-heading)]">{brl(analise.economiaEstimada.valorBrl)}</p>
          <p className="text-xs text-[var(--color-muted)]">{analise.economiaEstimada.descricao}</p>
        </div>
      )}

      {analise.opcoes.length > 0 && (
        <ul className="space-y-1.5">
          {analise.opcoes.map((o, i) => (
            <li key={i} className="rounded-lg border border-[var(--color-border)] px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-[var(--color-heading)]">{o.titulo}</span>
                {o.custoEstimadoBrl !== null && <span className="shrink-0 font-semibold">{brl(o.custoEstimadoBrl)}</span>}
              </div>
              {o.destaque && (
                <span className="mt-0.5 inline-block rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-300">
                  {o.destaque}
                </span>
              )}
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">{o.detalhe}</p>
            </li>
          ))}
        </ul>
      )}

      {analise.pontosDeAtencao.length > 0 && (
        <section aria-label="Pontos de atenção">
          <h4 className="mb-1 text-[11px] font-semibold tracking-wide text-[var(--color-muted)] uppercase">Pontos de atenção</h4>
          <ul className="space-y-1.5">
            {analise.pontosDeAtencao.map((p, i) => {
              const v = GRAVIDADE_VISUAL[p.gravidade];
              return (
                <li key={i} className="flex gap-2">
                  <v.Icone className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", v.classe)} aria-label={v.rotulo} />
                  <span>
                    <span className="font-medium text-[var(--color-heading)]">{p.titulo}.</span>{" "}
                    <span className="text-[var(--color-muted)]">{p.detalhe}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex gap-2 rounded-lg bg-blue-500/5 px-3 py-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
        <p>
          <span className="font-semibold text-[var(--color-heading)]">Na prática: </span>
          {analise.recomendacaoPratica}
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => executar("dica", salvarDicaNoRoteiro)}
          disabled={feitos.includes("dica")}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-heading)] hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
        >
          <Lightbulb className="h-3.5 w-3.5 text-blue-500" />
          Salvar Dica no Roteiro
        </button>
        <button
          type="button"
          onClick={() => executar("alerta", criarAlertaDePreco)}
          disabled={feitos.includes("alerta")}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-heading)] hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
        >
          <Bell className="h-3.5 w-3.5 text-blue-500" />
          Criar Alerta de Preço
        </button>
      </div>

      <div aria-live="polite">
        {estado.tipo !== "ocioso" && (
          <p className={cn("text-xs", estado.tipo === "erro" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
            {estado.texto}{" "}
            {estado.tipo === "erro" && estado.ajuda && (
              <Link href="/dashboard/alertas" className="underline">
                Abrir Alertas de Preço
              </Link>
            )}
          </p>
        )}
      </div>

      <footer className="border-t border-[var(--color-border)] pt-2 text-[10px] leading-snug text-[var(--color-subtle)]">
        {mostrarRodapeHistorico
          ? "Valores são estimativas históricas e podem variar: confira o preço final na emissão da passagem ou da reserva."
          : "Lista de conferência geral, sem preços. Confira as regras da companhia ou da hospedagem antes de pagar."}
      </footer>
    </article>
  );
}

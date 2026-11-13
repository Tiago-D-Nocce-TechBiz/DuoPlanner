"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { Clock, Compass, Lightbulb, Sparkles, Wallet } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { pedirExperiencias, type PedidoExperiencias } from "@/lib/ai/experiencias-cliente";
import { CAMPOS_EXPERIENCIA, QUANTIDADE_EXPERIENCIAS, type RascunhoExperiencia } from "@/lib/ai/experiencias-protocolo";

export type { PedidoExperiencias } from "@/lib/ai/experiencias-cliente";

/**
 * Etapa "Experiências Ocultas" das telas de busca, em fluxo: a rota
 * `POST /api/experiencias` manda NDJSON e cada card aparece enquanto a IA o
 * escreve, sem esperar as 3 sugestões.
 *
 * O pedido começa fora do React (`pedirExperiencias`, em
 * `experiencias-cliente.ts`), no submit da busca, em paralelo com a busca de
 * preços; a tela assina o estado quando for mostrar (`useSyncExternalStore`).
 */

/**
 * Um pedido por vez: pedir de novo cancela o anterior (a IA para de escrever
 * o que ninguém vai ler) e sair da tela cancela o atual.
 */
export function usePedidosDeExperiencias() {
  const atual = useRef<{ pedido: PedidoExperiencias | null }>({ pedido: null });
  useEffect(() => {
    const caixa = atual.current;
    return () => caixa.pedido?.cancelar();
  }, []);
  const pedir = useCallback((destino: string, dataViagem: string | null) => {
    atual.current.pedido?.cancelar();
    atual.current.pedido = pedirExperiencias(destino, dataViagem);
    return atual.current.pedido;
  }, []);
  const cancelar = useCallback(() => {
    atual.current.pedido?.cancelar();
    atual.current.pedido = null;
  }, []);
  return { pedir, cancelar };
}

export function LocalGems({ pedido }: { pedido: PedidoExperiencias }) {
  const estado = useSyncExternalStore(pedido.assinar, pedido.estado, pedido.estado);
  const { fase, prontas, rascunho } = estado;
  const emAndamento = fase === "conectando" || fase === "escrevendo";
  const vagas = emAndamento ? Math.max(0, QUANTIDADE_EXPERIENCIAS - prontas.length - (rascunho ? 1 : 0)) : 0;

  // Leitor de tela: um aviso por sugestão pronta, não um por trecho de texto.
  const anuncio =
    fase === "erro"
      ? `Sugestões da IA: ${estado.erro}`
      : fase === "pronto"
        ? `${prontas.length} ${prontas.length === 1 ? "sugestão pronta" : "sugestões prontas"} em ${estado.destino}.`
        : prontas.length > 0
          ? `${prontas.length} de ${QUANTIDADE_EXPERIENCIAS} sugestões prontas.`
          : "";

  return (
    <section aria-label="Experiências ocultas no destino" aria-busy={emAndamento}>
      <div className="mb-4 flex items-center gap-2">
        <Compass className="h-5 w-5 text-muted" />
        <h2 className="font-serif text-2xl font-semibold">
          Experiências ocultas{estado.destino ? ` em ${estado.destino}` : ""}
        </h2>
      </div>
      <p className="sr-only" role="status">
        {anuncio}
      </p>

      {fase === "erro" && prontas.length === 0 ? (
        <Card className="p-5 text-sm text-muted">Sugestões da IA indisponíveis: {estado.erro}</Card>
      ) : (
        <>
          {estado.contexto.length > 0 && (
            <p className="mb-4 text-xs text-subtle">Considerando a memória da dupla: {estado.contexto.join(" · ")}</p>
          )}
          {emAndamento && prontas.length === 0 && !rascunho && (
            <p className="mb-4 flex items-center gap-2 text-sm text-muted" aria-hidden>
              <Sparkles className="h-4 w-4 motion-safe:animate-pulse" />
              A IA está garimpando 3 experiências gratuitas ou baratas no destino…
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {prontas.map(({ indice, experiencia }) => (
              <CardSugestao key={`sugestao-${indice}`} dados={experiencia} escrevendo={false} />
            ))}
            {rascunho && <CardSugestao key={`sugestao-${rascunho.indice}`} dados={rascunho.experiencia} escrevendo />}
            {Array.from({ length: vagas }, (_, i) => (
              <CardVazio key={`vaga-${i}`} />
            ))}
          </div>
          {fase === "erro" && <p className="mt-3 text-xs text-muted">{estado.erro}</p>}
          {fase === "pronto" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-subtle">
              <Sparkles className="h-3.5 w-3.5" />
              Sugestões geradas por IA. Confira horários e regras antes de ir.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Altura mínima comum a vaga, rascunho e card pronto: a grade não pula quando o texto chega. */
const ALTURA_CARD = "min-h-56";

/** Card de uma sugestão: pronta ou ainda sendo escrita (mesmo componente, sem remontar ao fechar). */
function CardSugestao({ dados, escrevendo }: { dados: RascunhoExperiencia; escrevendo: boolean }) {
  const custo = dados.custo === "gratuito" || dados.custo === "baixo custo" ? dados.custo : null;
  const ultimo = escrevendo ? [...CAMPOS_EXPERIENCIA].reverse().find((campo) => dados[campo]) : undefined;
  const cursor = (campo: keyof RascunhoExperiencia) => (campo === ultimo ? <Cursor /> : null);

  return (
    <Card className={`flex ${ALTURA_CARD} flex-col p-5`} aria-busy={escrevendo || undefined}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-lg font-semibold leading-snug text-heading">
          {dados.nome ?? <span className="block h-5 w-40 rounded bg-elevated motion-safe:animate-pulse" aria-hidden />}
          {cursor("nome")}
        </h3>
        {custo && (
          <Badge variant={custo === "gratuito" ? "accent" : "neutral"}>{custo === "gratuito" ? "Grátis" : "Baixo custo"}</Badge>
        )}
      </div>
      {dados.descricao && (
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          {dados.descricao}
          {cursor("descricao")}
        </p>
      )}
      {(dados.custo_estimado || dados.melhor_momento || dados.dica_local) && (
        <dl className="mt-4 space-y-2 border-t border-border pt-4 text-xs text-muted">
          {dados.custo_estimado && (
            <Detail icon={Wallet} label="Custo estimado">
              {dados.custo_estimado}
              {cursor("custo_estimado")}
            </Detail>
          )}
          {dados.melhor_momento && (
            <Detail icon={Clock} label="Melhor momento">
              {dados.melhor_momento}
              {cursor("melhor_momento")}
            </Detail>
          )}
          {dados.dica_local && (
            <Detail icon={Lightbulb} label="Dica local">
              {dados.dica_local}
              {cursor("dica_local")}
            </Detail>
          )}
        </dl>
      )}
    </Card>
  );
}

function Cursor() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1em] w-0.5 translate-y-0.5 bg-current motion-safe:animate-pulse"
    />
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <dt className="sr-only">{label}</dt>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <dd>{children}</dd>
    </div>
  );
}

function CardVazio() {
  return (
    <Card className={`${ALTURA_CARD} p-5`} aria-hidden>
      <div className="h-5 w-2/3 rounded bg-elevated motion-safe:animate-pulse" />
      <div className="mt-4 h-3 w-full rounded bg-elevated motion-safe:animate-pulse" />
      <div className="mt-2 h-3 w-5/6 rounded bg-elevated motion-safe:animate-pulse" />
      <div className="mt-6 h-3 w-1/2 rounded bg-elevated motion-safe:animate-pulse" />
    </Card>
  );
}

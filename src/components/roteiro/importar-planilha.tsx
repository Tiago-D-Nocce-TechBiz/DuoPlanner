"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Upload, X } from "@/components/ui/icons";
import { pedirCuradoria } from "@/lib/roteiro/curadoria-cliente";
import { lerArquivoDoRoteiro } from "@/lib/roteiro/ler-arquivo";
import {
  aplicarCuradoria,
  montarEntradaCuradoria,
  organizarPlanilha,
  planoDeGravacao,
  resumoDaPrevisao,
  selecaoInicial,
  type Existentes,
  type Previsao,
} from "@/lib/roteiro/organizar";
import { interpretarPlanilha } from "@/lib/roteiro/planilha";
import type { LinhaPlanilha, ProblemaPlanilha, ResultadoCuradoria } from "@/lib/roteiro/tipos";
import { atualizarRegistro, criarRegistro, getContexto, getRegistros } from "@/lib/sync/motor";
import { DiaDaPrevia } from "./previa-importacao";

/**
 * Importar planilha com a Nora (módulo carregado sob demanda: só baixa quando
 * a pessoa abre o diálogo).
 *
 *   arquivo (.xlsx ou .csv, lido no navegador) → linhas interpretadas →
 *   organização por dia e turno NESTE aparelho → [opcional] curadoria da Nora
 *   (Server Action) → prévia dia a dia → gravação pelo motor de sincronização.
 *
 * Sem IA (chave, cota, prazo ou conexão), o resultado é o mesmo, só sem as
 * sugestões: a organização é determinística e não gasta cota. A gravação
 * entra na fila de sincronização em lotes (workspace da sessão) e a impressão
 * digital de cada atividade impede duplicar ao reimportar.
 */

type Etapa = { tipo: "arquivo" } | { tipo: "lendo" } | { tipo: "curando" } | { tipo: "previa" } | { tipo: "salvo"; atividades: number; dias: number };

const lerExistentes = (): Existentes => ({ dias: getRegistros("roteiro_dias"), itens: getRegistros("roteiro_itens") });

function reconstruir(linhas: readonly LinhaPlanilha[], curadoria: ResultadoCuradoria | null): Previsao {
  const existentes = lerExistentes();
  const base = organizarPlanilha(linhas, existentes);
  return curadoria ? aplicarCuradoria(base, curadoria, existentes) : base;
}

export function ImportarPlanilha({ aoFechar }: { aoFechar: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "arquivo" });
  const [sugerir, setSugerir] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [nomeDoArquivo, setNomeDoArquivo] = useState("");
  const [linhas, setLinhas] = useState<LinhaPlanilha[]>([]);
  const [problemas, setProblemas] = useState<ProblemaPlanilha[]>([]);
  const [curadoria, setCuradoria] = useState<ResultadoCuradoria | null>(null);
  const [previsao, setPrevisao] = useState<Previsao | null>(null);
  const [selecionados, setSelecionados] = useState<ReadonlySet<string>>(new Set());
  const [ignoradas, setIgnoradas] = useState<ReadonlySet<string>>(new Set());
  const dialogoRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLInputElement>(null);
  // Cada arquivo escolhido ganha um número: resposta de um anterior é descartada.
  const geracaoRef = useRef(0);

  useEffect(() => {
    dialogoRef.current?.focus();
  }, []);

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      aoFechar();
      return;
    }
    if (e.key !== "Tab" || !dialogoRef.current) return;
    // Mantém o foco dentro do diálogo.
    const focaveis = dialogoRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])'
    );
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  async function processar(arquivo: File) {
    const geracao = ++geracaoRef.current;
    setErro(null);
    setNomeDoArquivo(arquivo.name);
    setEtapa({ tipo: "lendo" });
    const leitura = await lerArquivoDoRoteiro(arquivo);
    if (geracao !== geracaoRef.current) return;
    if (!leitura.ok) {
      setErro(leitura.mensagem);
      setEtapa({ tipo: "arquivo" });
      return;
    }
    const lida = interpretarPlanilha(leitura.matriz);
    if (lida.linhas.length === 0) {
      setErro(lida.problemas.find((p) => p.gravidade === "erro")?.mensagem ?? "Não encontrei atividades nesta planilha.");
      setEtapa({ tipo: "arquivo" });
      return;
    }
    let resultado: ResultadoCuradoria | null = null;
    if (sugerir) {
      setEtapa({ tipo: "curando" });
      resultado = await pedirCuradoria(montarEntradaCuradoria(organizarPlanilha(lida.linhas, lerExistentes()), true));
      if (geracao !== geracaoRef.current) return;
    }
    const prev = reconstruir(lida.linhas, resultado);
    setLinhas(lida.linhas);
    setProblemas(lida.problemas);
    setCuradoria(resultado);
    setPrevisao(prev);
    setSelecionados(selecaoInicial(prev));
    setIgnoradas(new Set());
    setEtapa({ tipo: "previa" });
  }

  function alternar(chave: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(chave)) novo.add(chave);
      return novo;
    });
  }

  function ignorar(chave: string) {
    setIgnoradas((atual) => new Set(atual).add(chave));
    setSelecionados((atual) => {
      const novo = new Set(atual);
      novo.delete(chave);
      return novo;
    });
  }

  function salvar() {
    const ctx = getContexto();
    const userId = ctx?.userId ?? null;
    const workspaceId = ctx?.workspace?.id ?? null;
    if (!userId || !workspaceId) {
      setErro("O espaço do casal ainda está carregando. Tente de novo em instantes.");
      return;
    }
    // Reconstrói contra o roteiro de agora (o par pode ter mexido desde a prévia).
    const existentes = lerExistentes();
    const prev = reconstruir(linhas, curadoria);
    const plano = planoDeGravacao(prev, selecionados, existentes, {
      userId,
      workspaceId,
      agoraIso: new Date().toISOString(),
      novoId: () => crypto.randomUUID(),
    });
    // Dias antes das atividades: a fila mantém a ordem e o banco valida o dia.
    for (const dia of plano.diasNovos) criarRegistro("roteiro_dias", dia);
    for (const d of plano.diasComDestino) atualizarRegistro("roteiro_dias", d.id, { destino: d.destino });
    for (const item of plano.itens) criarRegistro("roteiro_itens", item);
    setErro(null);
    setEtapa({ tipo: "salvo", atividades: plano.itens.length, dias: plano.diasNovos.length });
  }

  const resumo = previsao ? resumoDaPrevisao(previsao, selecionados) : null;
  const avisos = problemas.filter((p) => p.gravidade === "aviso").length;
  const erros = problemas.filter((p) => p.gravidade === "erro").length;
  const ocupado = etapa.tipo === "lendo" || etapa.tipo === "curando";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onKeyDown={aoTeclar}>
      <div className="absolute inset-0 bg-black/70 md:backdrop-blur-sm" onClick={aoFechar} aria-hidden />
      <div
        ref={dialogoRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-importar-planilha"
        className="glass-panel relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl shadow-2xl shadow-black/60 outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <h2 id="titulo-importar-planilha" className="font-serif text-xl font-semibold text-[var(--color-heading)]">
              Importar planilha com a Nora
            </h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Aceita .xlsx e .csv. O arquivo é lido neste aparelho e você revisa tudo antes de salvar.
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="rounded-md p-1 text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {(etapa.tipo === "arquivo" || ocupado) && (
            <>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] p-3.5">
                <input
                  type="checkbox"
                  checked={sugerir}
                  disabled={ocupado}
                  onChange={(e) => setSugerir(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="text-sm text-[var(--color-heading)]">
                  <Sparkles className="mr-1.5 inline h-4 w-4 text-blue-500" />
                  Pedir para a Nora sugerir praias, passeios e restaurantes para os destinos da planilha
                  <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                    Desligado, a planilha é só organizada por dia e turno, sem usar a IA.
                  </span>
                </span>
              </label>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastando(true);
                }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastando(false);
                  const arquivo = e.dataTransfer.files[0];
                  if (arquivo && !ocupado) void processar(arquivo);
                }}
                data-zona-de-arquivo
                className={
                  "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors " +
                  (arrastando ? "border-blue-400 bg-blue-500/5" : "border-[var(--color-border)]")
                }
              >
                {ocupado ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--color-muted)]" />
                    <p role="status" className="text-sm text-[var(--color-heading)]">
                      {etapa.tipo === "curando" ? "A Nora está montando as sugestões…" : `Lendo ${nomeDoArquivo}…`}
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-[var(--color-muted)]" />
                    <p className="text-sm text-[var(--color-heading)]">Arraste a planilha aqui</p>
                    <button
                      type="button"
                      onClick={() => entradaRef.current?.click()}
                      className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[var(--color-accent-foreground)] cursor-pointer"
                    >
                      Escolher arquivo
                    </button>
                    <input
                      ref={entradaRef}
                      type="file"
                      accept=".xlsx,.csv"
                      aria-label="Arquivo da planilha (.xlsx ou .csv)"
                      className="sr-only"
                      onChange={(e) => {
                        const arquivo = e.target.files?.[0];
                        e.target.value = "";
                        if (arquivo) void processar(arquivo);
                      }}
                    />
                  </>
                )}
              </div>
            </>
          )}

          {erro && (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {erro}
            </p>
          )}

          {etapa.tipo === "previa" && previsao && resumo && (
            <>
              <div className="space-y-2" data-resumo-importacao>
                <p className="text-sm text-[var(--color-heading)]">
                  <strong>{resumo.daPlanilha}</strong> {resumo.daPlanilha === 1 ? "atividade nova" : "atividades novas"} em{" "}
                  {previsao.dias.length} {previsao.dias.length === 1 ? "dia" : "dias"}
                  {resumo.jaNoRoteiro > 0 && <>, {resumo.jaNoRoteiro} já no roteiro</>}
                  {resumo.sugestoes > 0 && <>, {resumo.sugestoes} sugestões da Nora</>}.
                </p>
                {previsao.repetidasNoArquivo > 0 && (
                  <p className="text-xs text-[var(--color-muted)]">
                    {previsao.repetidasNoArquivo} {previsao.repetidasNoArquivo === 1 ? "linha repetida foi ignorada" : "linhas repetidas foram ignoradas"}.
                  </p>
                )}
                {curadoria?.aviso && (
                  <p role="status" className="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                    {curadoria.aviso}
                  </p>
                )}
                {problemas.length > 0 && (
                  <details className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)]">
                    <summary className="cursor-pointer">
                      {erros > 0 && `${erros} ${erros === 1 ? "linha ignorada" : "linhas ignoradas"}`}
                      {erros > 0 && avisos > 0 && " e "}
                      {avisos > 0 && `${avisos} ${avisos === 1 ? "ajuste feito" : "ajustes feitos"}`}
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {problemas.map((p, i) => (
                        <li key={i}>
                          {p.linha !== null ? `Linha ${p.linha}: ` : ""}
                          {p.mensagem}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <div className="space-y-3">
                {previsao.dias.map((dia, i) => (
                  <DiaDaPrevia
                    key={dia.chave}
                    dia={dia}
                    numero={i + 1}
                    selecionados={selecionados}
                    ignoradas={ignoradas}
                    onAlternar={alternar}
                    onIgnorar={ignorar}
                  />
                ))}
              </div>
            </>
          )}

          {etapa.tipo === "salvo" && (
            <div role="status" data-importacao-salva className="py-6 text-center">
              <p className="font-serif text-lg font-semibold text-[var(--color-heading)]">
                {etapa.atividades === 0
                  ? "Nada novo para salvar."
                  : `${etapa.atividades} ${etapa.atividades === 1 ? "atividade salva" : "atividades salvas"} no Roteiro.`}
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {etapa.dias > 0 && `${etapa.dias} ${etapa.dias === 1 ? "dia novo criado. " : "dias novos criados. "}`}
                Quem já estava no roteiro não foi duplicado, e o par recebe tudo na hora (offline, sobe quando a conexão voltar).
              </p>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] px-6 py-4">
          {etapa.tipo === "previa" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setPrevisao(null);
                  setEtapa({ tipo: "arquivo" });
                }}
                className="rounded-xl px-4 py-2 text-xs font-medium text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                Trocar arquivo
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={!resumo || resumo.aSalvar === 0}
                className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-50"
              >
                {resumo && resumo.aSalvar > 0
                  ? `Salvar ${resumo.aSalvar} ${resumo.aSalvar === 1 ? "atividade" : "atividades"} no Roteiro`
                  : "Nada selecionado"}
              </button>
            </>
          )}
          {(etapa.tipo === "arquivo" || etapa.tipo === "salvo") && (
            <button
              type="button"
              onClick={aoFechar}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold text-[var(--color-accent-foreground)] cursor-pointer"
            >
              {etapa.tipo === "salvo" ? "Concluir" : "Cancelar"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

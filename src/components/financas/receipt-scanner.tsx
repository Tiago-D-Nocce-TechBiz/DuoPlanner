"use client";

import { useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Users,
} from "@/components/ui/icons";
import { processReceiptImage } from "@/app/dashboard/financas/actions";
import { CATEGORIAS, type Categoria, type Escopo } from "@/lib/finance/classificar";
import { parseValorMonetario } from "@/lib/finance/importar";
import { escopoSugeridoParaRecibo, type PropostaRecibo } from "@/lib/finance/recibo";

/**
 * Leitura de recibos e comprovantes Pix com IA (Finanças Duo).
 *
 * Fluxo: foto/arquivo → reduzido no navegador → Server Action
 * `processReceiptImage` (Gemini) → PROPOSTA editável → o usuário confirma.
 * Este componente não grava nada: entrega o gasto confirmado em
 * `onConfirmar` e a página decide como salvar (fila de sincronização).
 */

/** Teto do arquivo enviado (cabe no limite de 1 MB das Server Actions). */
const LIMITE_BYTES = 700 * 1024;
const TENTATIVAS: { lado: number; qualidade: number }[] = [
  { lado: 1600, qualidade: 0.82 },
  { lado: 1280, qualidade: 0.72 },
  { lado: 1024, qualidade: 0.65 },
];
const MOEDAS = ["BRL", "USD", "EUR", "GBP", "ARS", "CLP"];

export interface GastoDoRecibo {
  descricao: string;
  valor: number;
  moeda: string;
  /** 1 unidade da moeda em reais (null para BRL). */
  cotacaoBrl: number | null;
  data: string; // AAAA-MM-DD
  categoria: Categoria;
  escopo: Escopo;
}

function lerComoDataUrl(arquivo: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error ?? new Error("Falha ao ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

/** Tamanho real (bytes) de um data URL base64. */
function bytesDoDataUrl(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

async function prepararArquivo(arquivo: File): Promise<string> {
  if (arquivo.type === "application/pdf") {
    if (arquivo.size > LIMITE_BYTES) {
      throw new Error("PDF grande demais (máximo de 700 KB). Envie uma foto ou um print do comprovante.");
    }
    return lerComoDataUrl(arquivo);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    // Formatos que o navegador não decodifica (ex.: HEIC fora do Safari) vão como estão.
    if (arquivo.size > LIMITE_BYTES) {
      throw new Error("Imagem grande demais. Tire um print do comprovante ou use JPG/PNG.");
    }
    return lerComoDataUrl(arquivo);
  }

  try {
    for (const { lado, qualidade } of TENTATIVAS) {
      const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * escala);
      canvas.height = Math.round(bitmap.height * escala);
      const contexto = canvas.getContext("2d");
      if (!contexto) break;
      contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", qualidade);
      if (bytesDoDataUrl(dataUrl) <= LIMITE_BYTES) return dataUrl;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Não consegui reduzir a imagem o suficiente. Tente um print do comprovante.");
}

interface Rascunho {
  descricao: string;
  valor: string;
  moeda: string;
  cotacao: string;
  data: string;
  categoria: Categoria;
  escopo: Escopo;
}

function rascunhoDaProposta(proposta: PropostaRecibo, taxas: Record<string, number>): Rascunho {
  const { categoria, escopo } = escopoSugeridoParaRecibo(proposta);
  const taxa = taxas[proposta.moeda];
  return {
    descricao: proposta.titulo,
    valor: proposta.valor.toFixed(2).replace(".", ","),
    moeda: proposta.moeda,
    cotacao: proposta.moeda !== "BRL" && taxa ? taxa.toFixed(4).replace(".", ",") : "",
    data: proposta.data,
    categoria,
    escopo,
  };
}

export function ReceiptScanner({
  onConfirmar,
  taxas = {},
}: {
  onConfirmar: (gasto: GastoDoRecibo) => void | Promise<void>;
  /** Cotação do dia (1 unidade = X reais) para gastos em moeda estrangeira. */
  taxas?: Record<string, number>;
}) {
  const inputCamera = useRef<HTMLInputElement>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [lendo, startLeitura] = useTransition();
  const [salvando, startSalvar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [confirmado, setConfirmado] = useState<string | null>(null);

  function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    setErro(null);
    setAvisos([]);
    setRascunho(null);
    setConfirmado(null);
    startLeitura(async () => {
      try {
        const resultado = await processReceiptImage(await prepararArquivo(arquivo));
        if (!resultado.ok) {
          setErro(resultado.message);
          return;
        }
        setRascunho(rascunhoDaProposta(resultado.proposta, taxas));
        setAvisos(resultado.avisos);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      }
    });
  }

  function atualizar<K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) {
    setRascunho((atual) => (atual ? { ...atual, [campo]: valor } : atual));
  }

  function confirmar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!rascunho) return;
    const valor = parseValorMonetario(rascunho.valor);
    if (!rascunho.descricao.trim()) {
      setErro("Informe uma descrição.");
      return;
    }
    if (valor === null || valor <= 0) {
      setErro("Valor inválido. Use, por exemplo, 180,00 ou 1.250,90.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rascunho.data)) {
      setErro("Informe a data do gasto.");
      return;
    }
    let cotacaoBrl: number | null = null;
    if (rascunho.moeda !== "BRL") {
      cotacaoBrl = parseValorMonetario(rascunho.cotacao);
      if (cotacaoBrl === null || cotacaoBrl <= 0) {
        setErro(`Informe quanto vale 1 ${rascunho.moeda} em reais.`);
        return;
      }
    }
    setErro(null);
    const gasto: GastoDoRecibo = {
      descricao: rascunho.descricao.trim().slice(0, 120),
      valor,
      moeda: rascunho.moeda,
      cotacaoBrl,
      data: rascunho.data,
      categoria: rascunho.categoria,
      escopo: rascunho.escopo,
    };
    startSalvar(async () => {
      await onConfirmar(gasto);
      setConfirmado(gasto.descricao);
      setRascunho(null);
      setAvisos([]);
    });
  }

  return (
    <div className="glass-panel rounded-2xl p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/5 dark:bg-white/10 text-[var(--color-heading)]">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Ler recibo ou comprovante Pix</h2>
            <p className="mt-1 text-xs sm:text-sm text-[var(--color-muted)] leading-relaxed">
              A IA lê valor, data, moeda e categoria. Você confere antes de salvar.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputCamera.current?.click()}
            disabled={lendo}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
          >
            {lendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            {lendo ? "Lendo…" : "Tirar foto"}
          </button>
          <button
            type="button"
            onClick={() => inputArquivo.current?.click()}
            disabled={lendo}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer disabled:opacity-60"
          >
            Escolher arquivo
          </button>
          <input ref={inputCamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={aoEscolher} />
          <input ref={inputArquivo} type="file" accept="image/*,application/pdf" className="hidden" onChange={aoEscolher} />
        </div>
      </div>

      <div aria-live="polite">
        {erro && (
          <p role="alert" className="mt-4 flex items-start gap-2 text-xs text-[var(--color-danger)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {erro}
          </p>
        )}
        {confirmado && !rascunho && (
          <p role="status" className="mt-4 flex items-center gap-2 text-xs text-[var(--color-heading)]">
            <CheckCircle2 className="h-4 w-4" />“{confirmado}” foi salvo nas Finanças Duo.
          </p>
        )}
      </div>

      {rascunho && (
        <form onSubmit={confirmar} className="mt-5 rounded-xl border border-[var(--color-border-strong)] p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Confira antes de salvar</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="sm:col-span-2 text-xs text-[var(--color-muted)]">
              Descrição
              <input value={rascunho.descricao} onChange={(e) => atualizar("descricao", e.target.value)} className="glass-input mt-1" maxLength={120} />
            </label>
            <label className="text-xs text-[var(--color-muted)]">
              Valor
              <input value={rascunho.valor} onChange={(e) => atualizar("valor", e.target.value)} inputMode="decimal" className="glass-input mt-1" />
            </label>
            <label className="text-xs text-[var(--color-muted)]">
              Moeda
              <select
                value={rascunho.moeda}
                onChange={(e) => {
                  const moeda = e.target.value;
                  const taxa = taxas[moeda];
                  setRascunho((atual) =>
                    atual
                      ? { ...atual, moeda, cotacao: moeda !== "BRL" && taxa ? taxa.toFixed(4).replace(".", ",") : "" }
                      : atual
                  );
                }}
                className="glass-input mt-1"
              >
                {[...new Set([rascunho.moeda, ...MOEDAS])].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            {rascunho.moeda !== "BRL" && (
              <label className="sm:col-span-2 text-xs text-[var(--color-muted)]">
                1 {rascunho.moeda} em reais (cotação usada no acerto)
                <input
                  value={rascunho.cotacao}
                  onChange={(e) => atualizar("cotacao", e.target.value)}
                  inputMode="decimal"
                  placeholder="ex.: 5,43"
                  className="glass-input mt-1"
                />
              </label>
            )}
            <label className="text-xs text-[var(--color-muted)]">
              Data
              <input type="date" value={rascunho.data} onChange={(e) => atualizar("data", e.target.value)} className="glass-input mt-1" />
            </label>
            <label className="text-xs text-[var(--color-muted)]">
              Categoria
              <select value={rascunho.categoria} onChange={(e) => atualizar("categoria", e.target.value as Categoria)} className="glass-input mt-1">
                {CATEGORIAS.map((c) => (
                  <option key={c} value={c}>{c === "Gasto Pessoal (Fora da Viagem)" ? "Gasto Pessoal (Privado)" : c}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["viagem_compartilhado", "pessoal_privado"] as Escopo[]).map((escopo) => {
              const ativo = rascunho.escopo === escopo;
              const Icone = escopo === "viagem_compartilhado" ? Users : ShieldCheck;
              return (
                <button
                  key={escopo}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => atualizar("escopo", escopo)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${
                    ativo
                      ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
                      : "bg-black/5 dark:bg-white/10 text-[var(--color-muted)]"
                  }`}
                >
                  <Icone className="h-3.5 w-3.5" />
                  {escopo === "viagem_compartilhado" ? "Gasto da viagem" : "Pessoal (privado)"}
                </button>
              );
            })}
          </div>

          {avisos.length > 0 && (
            <ul className="space-y-1">
              {avisos.map((aviso) => (
                <li key={aviso} className="flex items-start gap-2 text-xs text-[var(--color-muted)]">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {aviso}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setRascunho(null);
                setAvisos([]);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold glass-panel cursor-pointer"
            >
              Descartar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              {salvando ? "Salvando…" : "Confirmar e salvar"}
            </button>
          </div>
        </form>
      )}

      <p className="mt-4 text-[11px] text-[var(--color-subtle)]">
        A imagem vai para o Google Gemini só para leitura e não fica guardada. JPG, PNG, WEBP, HEIC ou PDF (até 700 KB).
      </p>
    </div>
  );
}

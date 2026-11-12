"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Menu,
  Plus,
  Clock,
  X,
  Expand,
  Wand,
  Mic,
  ArrowUp,
  Sparkles,
  Plane,
  Bus,
  Hotel,
  ExternalLink,
  Wallet,
  ShieldCheck,
  Users,
  CheckCircle2,
} from "@/components/ui/icons";
import { NoraAvatar } from "./nora-avatar";
import { useNora, type NoraMensagem } from "./nora-provider";
import { responderNora, type NoraAcao, type GrupoIcone } from "@/lib/ai/nora-brain";
import { adicionarDespesa, rotuloCategoria } from "@/lib/finance/store";
import { writeLocal, STORAGE_KEYS } from "@/lib/local-store";
import { getContexto } from "@/lib/sync/motor";
import { cn } from "@/lib/utils";

/* ----------------------------- Utilidades UI ------------------------------ */

function idMsg() {
  return Math.random().toString(36).substring(2, 9);
}

/** Nome e cidade base vêm do perfil sincronizado (Configurações). */
function contextoConta() {
  const perfil = getContexto()?.perfil;
  return {
    nomeUsuario: perfil?.nome?.trim() || undefined,
    cidadeBase: perfil?.cidadeBase?.trim() || undefined,
    iataBase: perfil?.iataBase?.trim() || undefined,
  };
}

const PILULAS: { rotulo: string; prompt: string }[] = [
  { rotulo: "Gerar links de Passagens (Voos e Ônibus)", prompt: "Quero passagens de voo e ônibus. Me ajude a montar a busca." },
  { rotulo: "Buscar Hospedagens para as nossas datas", prompt: "Quero hospedagem para a nossa viagem." },
  { rotulo: "Organizar Finanças ou Triar Fatura Nubank", prompt: "Como funciona a triagem da fatura do Nubank e a divisão das finanças?" },
  { rotulo: "Como funciona o sistema e convite da dupla?", prompt: "Como funciona o DuoPlanner e como convido minha dupla?" },
];

const PROMPTS_RAPIDOS: { rotulo: string; prompt: string }[] = [
  { rotulo: "Passagens de ida e volta", prompt: "Quero passagens de ida e volta de " },
  { rotulo: "Hospedagem para o casal", prompt: "Quero hospedagem em " },
  { rotulo: "Lançar gasto compartilhado", prompt: "Lance R$ 0 de  como gasto compartilhado da viagem" },
  { rotulo: "Resumo das finanças", prompt: "Quanto já gastamos na viagem e quanto fica para cada um?" },
];

const ICONE_GRUPO: Record<GrupoIcone, typeof Plane> = {
  voos: Plane,
  onibus: Bus,
  hospedagem: Hotel,
};

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;

/* -------------------------- Cards de ação da Nora ------------------------- */

function CardAcao({
  acao,
  onAtualizar,
  onConfirmarDespesa,
}: {
  acao: NoraAcao;
  /** Substitui esta ação na mensagem (status/escopo da proposta). */
  onAtualizar: (nova: NoraAcao) => void;
  /** Grava a despesa proposta e marca a proposta como confirmada. */
  onConfirmarDespesa: () => void;
}) {
  const router = useRouter();

  if (acao.tipo === "links") {
    const dados = acao.dados;
    const preencherModo = acao.preencherModo;
    const preencherTela = () => {
      writeLocal(STORAGE_KEYS.concierge, { dados, modo: preencherModo });
      router.push(preencherModo === "hospedagem" ? "/dashboard/buscar-hospedagem" : "/dashboard/buscar-viagem");
    };
    return (
      <div className="mt-3 space-y-4">
        {acao.grupos.map((g) => {
          const Icone = ICONE_GRUPO[g.icone];
          return (
            <div key={g.titulo}>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-heading">
                <Icone className="h-3.5 w-3.5 text-muted" /> {g.titulo}
              </p>
              <div className="flex flex-wrap gap-2">
                {g.links.map((l) => (
                  <a
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={l.note}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:border-border-strong hover:text-heading"
                  >
                    {l.name}
                    <ExternalLink className="h-3 w-3 text-subtle" />
                  </a>
                ))}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          onClick={preencherTela}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-accent)] px-3.5 py-2 text-xs font-semibold text-[var(--color-accent-foreground)] hover:opacity-90 transition-opacity"
        >
          Preencher tela de busca com estes dados →
        </button>
      </div>
    );
  }

  if (acao.tipo === "proposta_despesa") {
    const { item, status } = acao;
    const privado = item.escopo === "pessoal_privado";
    const alternarEscopo = () =>
      onAtualizar({
        ...acao,
        item: { ...item, escopo: privado ? "viagem_compartilhado" : "pessoal_privado" },
      });
    return (
      <div className="mt-3 rounded-xl border border-border bg-background p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-heading">
            <Wallet className="h-3.5 w-3.5 shrink-0 text-muted" />
            <span className="truncate">{item.estabelecimento}</span>
          </span>
          <span className="font-semibold text-sm text-heading">{brl(item.valor)}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          {privado ? <ShieldCheck className="h-3 w-3" /> : <Users className="h-3 w-3" />}
          {privado ? "Pessoal (privado, oculto)" : "Compartilhado · entra no acerto do casal"}
          <span className="text-subtle">· {rotuloCategoria(item)}</span>
        </div>
        {status === "pendente" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onConfirmarDespesa}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-accent-foreground)] hover:opacity-90 transition-opacity"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirmar
            </button>
            <button
              type="button"
              onClick={alternarEscopo}
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-heading hover:border-border-strong transition-colors"
            >
              {privado ? "Mudar para compartilhado" : "Mudar para pessoal"}
            </button>
            <button
              type="button"
              onClick={() => onAtualizar({ ...acao, status: "descartada" })}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-muted hover:text-heading transition-colors"
            >
              Descartar
            </button>
          </div>
        ) : (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted" role="status">
            {status === "confirmada" ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Registrado no DuoFinance
              </>
            ) : (
              "Descartado: nada foi registrado."
            )}
          </p>
        )}
      </div>
    );
  }

  if (acao.tipo === "resumo") {
    return (
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted">Compartilhado</p>
          <p className="mt-1 font-semibold text-sm text-heading">{brl(acao.totalCompartilhado)}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted">Sua parte</p>
          <p className="mt-1 font-semibold text-sm text-heading">{brl(acao.metade)}</p>
        </div>
        <div className="rounded-xl border border-border bg-background p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted">Pessoal 🔒</p>
          <p className="mt-1 font-semibold text-sm text-heading">{brl(acao.totalPrivado)}</p>
        </div>
      </div>
    );
  }

  if (acao.tipo === "atalho") {
    const { href, acaoId, rotulo } = acao;
    const executarAtalho = () => {
      if (href) {
        router.push(href);
        return;
      }
      if (acaoId === "convite") {
        window.dispatchEvent(new Event("nora:abrir-convite"));
      } else if (acaoId === "triagem") {
        router.push("/dashboard/financas");
      } else if (acaoId === "roteiro") {
        router.push("/dashboard/roteiro");
      }
    };
    return (
      <button
        type="button"
        onClick={executarAtalho}
        className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-semibold text-heading hover:border-border-strong transition-colors"
      >
        {rotulo} →
      </button>
    );
  }

  return null;
}

/* --------------------------- Microfone (Web Speech) ----------------------- */

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function criarReconhecimento(): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = "pt-BR";
  rec.interimResults = true;
  rec.continuous = false;
  return rec;
}

/* --------------------------------- Drawer --------------------------------- */

export function NoraDrawer() {
  const { aberta, expandida, mensagens, nomeUsuario: nome, fechar, alternarExpandir, novaConversa, setMensagens } = useNora();
  const [texto, setTexto] = useState("");
  const [ouvindo, setOuvindo] = useState(false);
  const [menuPrompts, setMenuPrompts] = useState(false);
  const [pensando, setPensando] = useState(false);

  const router = useRouter();
  const reconhecimentoRef = useRef<SpeechRecognitionLike | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Resposta agendada (a Nora "pensa" antes de responder). Guardada para ser
  // cancelada em "Nova conversa" e ao desmontar; senão a resposta antiga
  // cairia na conversa nova.
  const respostaPendenteRef = useRef<{ timer: ReturnType<typeof setTimeout> | null }>({ timer: null });
  // Propostas já gravadas: evita lançar duas vezes com clique duplo.
  const propostasGravadasRef = useRef(new Set<string>());

  useEffect(() => {
    const pendente = respostaPendenteRef.current;
    return () => {
      if (pendente.timer !== null) clearTimeout(pendente.timer);
    };
  }, []);

  // O painel é montado sob demanda já aberto (`nora-sob-demanda`): espera o
  // navegador pintar o estado fechado antes de abrir, senão a transição de
  // entrada não acontece. Dois quadros garantem uma pintura no meio.
  const [pronta, setPronta] = useState(false);
  useEffect(() => {
    let segundo = 0;
    const primeiro = requestAnimationFrame(() => {
      segundo = requestAnimationFrame(() => setPronta(true));
    });
    return () => {
      cancelAnimationFrame(primeiro);
      cancelAnimationFrame(segundo);
    };
  }, []);
  const visivel = aberta && pronta;

  // Rola para a última mensagem quando a conversa cresce ou a Nora pensa.
  useEffect(() => {
    if (aberta) fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, aberta, pensando]);

  // Fecha com ESC.
  useEffect(() => {
    if (!aberta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberta, fechar]);

  function enviar(mensagem?: string) {
    const conteudo = (mensagem ?? texto).trim();
    if (!conteudo || pensando) return;
    const msgUser: NoraMensagem = { id: idMsg(), papel: "user", texto: conteudo };
    setMensagens((prev) => [...prev, msgUser]);
    setTexto("");
    setMenuPrompts(false);

    // A Nora "pensa" por alguns segundos antes de responder — tempo proporcional
    // ao tamanho da pergunta (mín. ~1,4s, máx. ~3s), para parecer deliberada.
    setPensando(true);
    const resposta = responderNora(conteudo, contextoConta());
    const atraso = Math.min(3000, 1400 + conteudo.length * 18);
    const pendente = respostaPendenteRef.current;
    if (pendente.timer !== null) clearTimeout(pendente.timer);
    pendente.timer = setTimeout(() => {
      pendente.timer = null;
      const msgNora: NoraMensagem = { id: idMsg(), papel: "nora", texto: resposta.texto, resposta };
      setMensagens((prev) => [...prev, msgNora]);
      setPensando(false);
    }, atraso);
  }

  function iniciarNovaConversa() {
    const pendente = respostaPendenteRef.current;
    if (pendente.timer !== null) {
      clearTimeout(pendente.timer);
      pendente.timer = null;
    }
    setPensando(false);
    novaConversa();
  }

  /** Troca a ação `indice` da mensagem `msgId` (status/escopo da proposta). */
  function atualizarAcao(msgId: string, indice: number, nova: NoraAcao) {
    setMensagens((prev) =>
      prev.map((m) =>
        m.id === msgId && m.resposta
          ? { ...m, resposta: { ...m.resposta, acoes: m.resposta.acoes.map((a, i) => (i === indice ? nova : a)) } }
          : m
      )
    );
  }

  function confirmarDespesa(msgId: string, indice: number, acao: NoraAcao) {
    if (acao.tipo !== "proposta_despesa" || acao.status !== "pendente") return;
    const gravadas = propostasGravadasRef.current;
    if (gravadas.has(acao.item.id)) return;
    gravadas.add(acao.item.id);
    // Sem o contexto do painel (ainda carregando), não finge que salvou.
    if (!adicionarDespesa(acao.item)) {
      gravadas.delete(acao.item.id);
      return;
    }
    atualizarAcao(msgId, indice, { ...acao, status: "confirmada" });
  }

  function alternarMicrofone() {
    if (ouvindo) {
      reconhecimentoRef.current?.stop();
      setOuvindo(false);
      return;
    }
    const rec = criarReconhecimento();
    if (!rec) {
      setTexto((t) => t);
      alert("Seu navegador não suporta ditado por voz. Use o Chrome/Edge para esse recurso.");
      return;
    }
    reconhecimentoRef.current = rec;
    rec.onresult = (e) => {
      const ultimo = e.results[e.results.length - 1];
      const transcrito = ultimo?.[0]?.transcript ?? "";
      if (transcrito) setTexto(transcrito);
    };
    rec.onend = () => setOuvindo(false);
    rec.onerror = () => setOuvindo(false);
    setOuvindo(true);
    rec.start();
  }

  function autoAjustar(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  const semMensagens = mensagens.length === 0;

  return (
    <>
      {/* Overlay */}
      <div
        className={cn(
          "fixed inset-0 z-[60] bg-black/40 transition-opacity duration-300",
          visivel ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={fechar}
        aria-hidden
      />

      {/* Painel lateral direito */}
      <aside
        role="dialog"
        aria-label="Nora — assistente de IA"
        className={cn(
          "nora-surface fixed top-0 right-0 z-[61] h-screen w-full border-l border-[var(--color-border)] flex flex-col transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] shadow-2xl",
          expandida ? "sm:w-[600px]" : "sm:w-[420px]",
          visivel ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header duplo */}
        <div className="border-b border-[var(--color-border)] px-4 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="group flex items-center gap-2.5">
              <NoraAvatar tamanho={34} />
              <span className="font-serif text-base font-semibold text-[var(--color-heading)]">Nora</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={alternarExpandir}
                title={expandida ? "Recolher largura" : "Expandir largura"}
                className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-full glass-panel text-[var(--color-heading)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <Expand className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={fechar}
                title="Fechar"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full glass-panel text-[var(--color-heading)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-heading)]">
              <Menu className="h-4 w-4 text-[var(--color-muted)]" />
              Novo chat
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={iniciarNovaConversa}
                title="Nova conversa"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full glass-panel text-[var(--color-heading)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Histórico de conversas"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full glass-panel text-[var(--color-heading)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <Clock className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-4 py-5">
          {semMensagens ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <NoraAvatar tamanho={64} className="mb-6" />
              <h2 className="font-serif text-2xl font-bold leading-snug px-4 text-[var(--color-heading)]">
                Olá {nome},
                <br /> como posso ajudar você hoje?
              </h2>
              <div className="mt-8 flex w-full flex-col gap-2.5">
                {PILULAS.map((p) => (
                  <button
                    key={p.rotulo}
                    type="button"
                    onClick={() => enviar(p.prompt)}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-background px-4 py-2.5 text-left text-sm text-[var(--color-heading)] transition-colors hover:border-blue-400/50 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-blue-500" />
                    {p.rotulo}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {mensagens.map((m) =>
                m.papel === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--color-accent)] px-4 py-2.5 text-sm text-[var(--color-accent-foreground)]">
                      {m.texto}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-2.5">
                    <NoraAvatar tamanho={28} className="mt-0.5" />
                    <div className="max-w-[88%]">
                      <div className="rounded-2xl rounded-tl-sm border border-[var(--color-border)] bg-background px-4 py-2.5 text-sm leading-relaxed text-[var(--color-heading)]">
                        {m.texto}
                        {m.resposta?.acoes.map((a, i) => (
                          <CardAcao
                            key={i}
                            acao={a}
                            onAtualizar={(nova) => atualizarAcao(m.id, i, nova)}
                            onConfirmarDespesa={() => confirmarDespesa(m.id, i, a)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )
              )}
              {pensando && (
                <div className="flex gap-2.5">
                  <NoraAvatar tamanho={28} className="mt-0.5" />
                  <div className="rounded-2xl rounded-tl-sm border border-[var(--color-border)] bg-background px-4 py-3">
                    <span className="flex items-center gap-1" aria-label="Nora está pensando">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted)] animate-[nora-think_1.2s_ease-in-out_infinite]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted)] animate-[nora-think_1.2s_ease-in-out_0.2s_infinite]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted)] animate-[nora-think_1.2s_ease-in-out_0.4s_infinite]" />
                    </span>
                  </div>
                </div>
              )}
              <div ref={fimRef} />
            </div>
          )}
        </div>

        {/* Caixa de pergunta flutuante */}
        <div className="px-4 pb-4 pt-2">
          {menuPrompts && (
            <div className="mb-2 rounded-xl border border-blue-400/30 bg-background p-2 shadow-lg">
              {PROMPTS_RAPIDOS.map((p) => (
                <button
                  key={p.rotulo}
                  type="button"
                  onClick={() => {
                    setTexto(p.prompt);
                    setMenuPrompts(false);
                    inputRef.current?.focus();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-heading)] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                  {p.rotulo}
                </button>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-blue-400/30 bg-[var(--color-elevated)] p-2.5 shadow-lg">
            <textarea
              ref={inputRef}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                autoAjustar(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
              rows={1}
              placeholder="Insira sua pergunta"
              className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-[var(--color-heading)] placeholder:text-[var(--color-subtle)] focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-between">
              <div className="flex items-center gap-1">
                {/* A importação (com triagem item a item) fica no DuoFinance;
                    o chat não lê arquivos. */}
                <button
                  type="button"
                  onClick={() => {
                    fechar();
                    router.push("/dashboard/financas");
                  }}
                  title="Importar fatura ou extrato (abre o DuoFinance)"
                  aria-label="Importar fatura ou extrato (abre o DuoFinance)"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--color-heading)] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMenuPrompts((v) => !v)}
                  title="Prompts prontos"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--color-heading)] transition-colors"
                >
                  <Wand className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={alternarMicrofone}
                  title={ouvindo ? "Parar ditado" : "Ditar por voz (pt-BR)"}
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                    ouvindo
                      ? "bg-red-500/15 text-red-500 animate-pulse"
                      : "text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--color-heading)]"
                  )}
                >
                  <Mic className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => enviar()}
                  disabled={!texto.trim() || pensando}
                  title="Enviar"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-foreground)] disabled:opacity-40 hover:opacity-90 transition-opacity"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-[var(--color-subtle)]">
            A IA pode cometer erros, portanto, verifique se os resultados são precisos.
          </p>
        </div>
      </aside>
    </>
  );
}

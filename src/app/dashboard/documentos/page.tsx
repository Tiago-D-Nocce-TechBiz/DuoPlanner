"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { ShieldCheck, Users, AlertTriangle } from "@/components/ui/icons";
import {
  listarDocumentos,
  removerDocumento,
  revelarNumeroDocumento,
  salvarDocumento,
} from "@/app/dashboard/documentos/actions";
import {
  alertaValidade,
  finalDoNumero,
  mascararNumero,
  TIPOS_DOCUMENTO,
  type DocumentoVisivel,
} from "@/lib/documentos/modelo";
import { isoToBR } from "@/lib/dates";
import { useHoje } from "@/lib/local-store";
import { useContextoSync } from "@/lib/sync/motor";

/**
 * Cofre de Documentos da viagem.
 *
 * O número (passaporte, RG...) é cifrado no servidor (AES-256-GCM) e a tela
 * só recebe os 4 últimos caracteres. "Revelar" decifra sob demanda, por 30 s.
 * Offline, mostra a última lista — também mascarada — guardada no aparelho
 * (apagada no logout). Nada de número completo no localStorage.
 *
 * Gravação direta no servidor (sem a fila offline, de propósito), com
 * `useOptimistic`: guardar, remover e compartilhar aparecem na hora; se o
 * servidor recusar, a lista volta sozinha ao estado real e o motivo aparece.
 */

type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

const FORM_VAZIO = {
  tipo: TIPOS_DOCUMENTO[0] as TipoDocumento,
  titular: "",
  numero: "",
  validade: "",
  observacao: "",
  escopo: "pessoal_privado" as DocumentoVisivel["escopo"],
};

/** Documento ainda não confirmado pelo servidor. */
type DocumentoNaTela = DocumentoVisivel & { pendente?: boolean };

type AcaoOtimista =
  | { tipo: "adicionar"; documento: DocumentoNaTela }
  | { tipo: "remover"; id: string }
  | { tipo: "escopo"; id: string; escopo: DocumentoVisivel["escopo"] };

function aplicarOtimista(lista: DocumentoNaTela[], acao: AcaoOtimista): DocumentoNaTela[] {
  if (acao.tipo === "adicionar") return [acao.documento, ...lista];
  if (acao.tipo === "remover") return lista.filter((d) => d.id !== acao.id);
  return lista.map((d) => (d.id === acao.id ? { ...d, escopo: acao.escopo, pendente: true } : d));
}

const tipoValido = (t: string): TipoDocumento =>
  (TIPOS_DOCUMENTO as readonly string[]).includes(t) ? (t as TipoDocumento) : "Outro";

const chaveCache = (userId: string) => `pd-docs:${userId}`;

/** Cópia offline da lista (já mascarada; apagada no logout como todo `pd-*`). */
function guardarCache(userId: string, lista: DocumentoVisivel[]) {
  try {
    window.localStorage.setItem(chaveCache(userId), JSON.stringify(lista));
  } catch {
    // sem cache offline
  }
}

const SEM_CONEXAO = "Sem conexão: documentos só são guardados online (o número não fica no aparelho).";

export default function DocumentosPage() {
  const ctx = useContextoSync();
  const userId = ctx?.userId ?? null;
  const [docs, setDocs] = useState<DocumentoVisivel[]>([]);
  const [docsNaTela, mostrarOtimista] = useOptimistic<DocumentoNaTela[], AcaoOtimista>(docs, aplicarOtimista);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "offline" | "indisponivel">("carregando");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [revelados, setRevelados] = useState<Record<string, string>>({});
  const [salvando, startSalvar] = useTransition();
  const [, startAlteracao] = useTransition();
  const [revelando, startRevelar] = useTransition();
  const hoje = useHoje();

  useEffect(() => {
    if (!userId) return;
    let ativo = true;
    const usarCopiaLocal = () => {
      try {
        const bruto = window.localStorage.getItem(chaveCache(userId));
        if (bruto) setDocs(JSON.parse(bruto) as DocumentoVisivel[]);
      } catch {
        // ignora
      }
    };
    listarDocumentos()
      .then((r) => {
        if (!ativo) return;
        if (r.success) {
          setDocs(r.data);
          setEstado("pronto");
        } else if (r.code === "NAO_CONFIGURADO") {
          setEstado("indisponivel");
          setMensagem(r.error);
        } else {
          setEstado("offline");
          setMensagem(r.error);
          usarCopiaLocal();
        }
      })
      .catch(() => {
        if (!ativo) return;
        setEstado("offline");
        usarCopiaLocal();
      });
    return () => {
      ativo = false;
    };
  }, [userId]);

  // A cópia offline acompanha a lista confirmada pelo servidor.
  useEffect(() => {
    if (userId && estado === "pronto") guardarCache(userId, docs);
  }, [userId, estado, docs]);

  /**
   * Atualiza a lista confirmada a partir da mais recente (duas remoções
   * seguidas não se sobrescrevem).
   */
  function confirmar(transformar: (atual: DocumentoVisivel[]) => DocumentoVisivel[]) {
    setDocs(transformar);
  }

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titular.trim() && !form.numero.trim()) {
      setMensagem("Informe o titular ou o número do documento.");
      return;
    }
    const enviado = form;
    startSalvar(async () => {
      mostrarOtimista({
        tipo: "adicionar",
        documento: {
          id: `pendente-${crypto.randomUUID()}`,
          userId: userId ?? "",
          tipo: enviado.tipo,
          titular: enviado.titular.trim(),
          numeroFinal: enviado.numero.trim() ? finalDoNumero(enviado.numero.trim()) : null,
          temNumeroCompleto: false,
          validade: enviado.validade || null,
          observacao: enviado.observacao.trim(),
          escopo: enviado.escopo,
          atualizadoEm: new Date().toISOString(),
          pendente: true,
        },
      });
      try {
        const r = await salvarDocumento(enviado);
        if (!r.success) return setMensagem(r.error);
        confirmar((atual) => [r.data.documento, ...atual]);
        // O formulário só limpa depois de confirmado: na falha, nada se perde.
        setForm(FORM_VAZIO);
        setMensagem(r.data.aviso ?? "Documento guardado no cofre.");
      } catch {
        setMensagem(SEM_CONEXAO);
      }
    });
  };

  const remover = (id: string) => {
    startAlteracao(async () => {
      mostrarOtimista({ tipo: "remover", id });
      try {
        const r = await removerDocumento(id);
        if (!r.success) return setMensagem(r.error);
        confirmar((atual) => atual.filter((d) => d.id !== id));
      } catch {
        setMensagem("Sem conexão: tente remover quando a internet voltar.");
      }
    });
  };

  const alternarCompartilhamento = (d: DocumentoVisivel) => {
    const escopo = d.escopo === "viagem_compartilhado" ? "pessoal_privado" : "viagem_compartilhado";
    startAlteracao(async () => {
      mostrarOtimista({ tipo: "escopo", id: d.id, escopo });
      try {
        const r = await salvarDocumento({
          id: d.id,
          tipo: tipoValido(d.tipo),
          titular: d.titular,
          numero: "",
          validade: d.validade ?? "",
          observacao: d.observacao,
          escopo,
        });
        if (!r.success) return setMensagem(r.error);
        confirmar((atual) => atual.map((x) => (x.id === d.id ? r.data.documento : x)));
      } catch {
        setMensagem("Sem conexão: tente de novo quando a internet voltar.");
      }
    });
  };

  const revelar = (id: string) => {
    startRevelar(async () => {
      try {
        const r = await revelarNumeroDocumento(id);
        if (!r.success) return setMensagem(r.error);
        const { numero } = r.data;
        setRevelados((atual) => ({ ...atual, [id]: numero }));
        // Some sozinho depois de 30 s (tela de celular emprestado, print...).
        setTimeout(() => {
          setRevelados((atual) => {
            const proximo = { ...atual };
            delete proximo[id];
            return proximo;
          });
        }, 30_000);
      } catch {
        setMensagem("Sem conexão: o número completo só abre online.");
      }
    });
  };

  const temPar = (ctx?.membros.length ?? 0) > 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">Documentos da Viagem</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Guarde as referências dos documentos para ter tudo à mão durante a viagem.
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-4 flex items-start gap-3 ring-1 ring-[var(--color-border-strong)]">
        <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--color-heading)]" />
        <p className="text-xs text-[var(--color-muted)]">
          O número fica cifrado no servidor e aparece mascarado ({mascararNumero("1234")}). Toque em “Revelar” para
          ver por 30 segundos. Documentos são privados; compartilhe só os que seu par precisa ver.
          {ctx && !ctx.criptografiaDocumentos && " Neste ambiente a criptografia não está configurada: só os 4 últimos caracteres são guardados."}
        </p>
      </div>

      {estado === "offline" && (
        <p role="status" className="text-xs text-[var(--color-muted)]">
          Sem conexão: mostrando a última lista salva neste aparelho (sem os números).
        </p>
      )}
      {estado === "indisponivel" && <p role="status" className="text-xs text-[var(--color-muted)]">{mensagem}</p>}

      <form onSubmit={adicionar} className="glass-panel rounded-2xl p-6 space-y-4">
        <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Adicionar documento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select aria-label="Tipo de documento" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: tipoValido(e.target.value) })} className="glass-input">
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input type="text" aria-label="Titular" placeholder="Titular (ex.: nome na reserva)" value={form.titular} maxLength={120} onChange={(e) => setForm({ ...form, titular: e.target.value })} className="glass-input" />
          <input type="text" aria-label="Número ou código" placeholder="Número / código" value={form.numero} maxLength={64} autoComplete="off" onChange={(e) => setForm({ ...form, numero: e.target.value })} className="glass-input" />
          <div>
            <label htmlFor="doc-validade" className="block text-xs text-[var(--color-muted)] mb-1">Validade (opcional)</label>
            <input id="doc-validade" type="date" value={form.validade} onChange={(e) => setForm({ ...form, validade: e.target.value })} className="glass-input" />
          </div>
          <input type="text" aria-label="Observação" placeholder="Observação (ex.: localizador da reserva)" value={form.observacao} maxLength={300} onChange={(e) => setForm({ ...form, observacao: e.target.value })} className="glass-input sm:col-span-2" />
          {temPar && (
            <label className="sm:col-span-2 inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <input
                type="checkbox"
                checked={form.escopo === "viagem_compartilhado"}
                onChange={(e) => setForm({ ...form, escopo: e.target.checked ? "viagem_compartilhado" : "pessoal_privado" })}
              />
              Compartilhar com meu par
            </label>
          )}
        </div>
        {mensagem && estado !== "indisponivel" && <p role="status" className="text-xs text-[var(--color-muted)]">{mensagem}</p>}
        <button
          type="submit"
          disabled={salvando || estado === "indisponivel" || !ctx}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
        >
          {salvando ? "Guardando…" : "+ Guardar documento"}
        </button>
      </form>

      {estado === "carregando" ? (
        <div className="glass-panel rounded-2xl p-10 text-center text-sm text-[var(--color-muted)]">Carregando o cofre…</div>
      ) : docsNaTela.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center text-sm text-[var(--color-muted)]">Nenhum documento guardado ainda.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {docsNaTela.map((d) => {
            const meu = d.userId === userId;
            const validade = hoje ? alertaValidade(d.validade, hoje) : null;
            return (
              <article key={d.id} aria-busy={d.pendente || undefined} className={`glass-panel rounded-2xl p-5 transition-opacity ${d.pendente ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-[var(--color-subtle)]">
                      {d.escopo === "viagem_compartilhado" ? <Users className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                      {d.tipo}
                      {!meu && " · do seu par"}
                      {d.pendente && " · salvando…"}
                    </span>
                    <p className="mt-1 font-serif text-lg font-bold text-[var(--color-heading)]">{d.titular || "—"}</p>
                  </div>
                  {meu && !d.pendente && (
                    <button type="button" onClick={() => remover(d.id)} aria-label={`Remover ${d.tipo}`} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)] cursor-pointer">✕</button>
                  )}
                </div>
                <p className="mt-2 text-sm text-[var(--color-foreground)] font-mono">
                  Nº {revelados[d.id] ?? mascararNumero(d.numeroFinal)}
                </p>
                {d.validade && (
                  <p className={`mt-1 text-xs ${validade ? "text-[var(--color-danger)] font-semibold" : "text-[var(--color-muted)]"}`}>
                    {validade && <AlertTriangle className="inline h-3 w-3 mr-1 -mt-0.5" />}
                    Validade {isoToBR(d.validade)}
                    {validade === "vencido" ? " · vencido" : validade === "vence_em_breve" ? " · vence em menos de 90 dias" : ""}
                  </p>
                )}
                {d.observacao && <p className="mt-1 text-xs text-[var(--color-muted)]">{d.observacao}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.temNumeroCompleto && !revelados[d.id] && (
                    <button type="button" onClick={() => revelar(d.id)} disabled={revelando} className="px-3 py-1.5 rounded-lg text-xs font-semibold glass-panel cursor-pointer disabled:opacity-60">
                      Revelar número
                    </button>
                  )}
                  {meu && temPar && !d.pendente && (
                    <button type="button" onClick={() => alternarCompartilhamento(d)} className="px-3 py-1.5 rounded-lg text-xs font-semibold glass-panel cursor-pointer disabled:opacity-60">
                      {d.escopo === "viagem_compartilhado" ? "Tornar privado" : "Compartilhar com meu par"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

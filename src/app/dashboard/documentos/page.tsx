"use client";

import { useMemo, useState } from "react";
import { readLocal, writeLocal, useMontado, STORAGE_KEYS } from "@/lib/local-store";

/**
 * Cofre de Documentos da viagem.
 *
 * Guarda referências de documentos (passaporte, seguro, voucher de reserva,
 * etc.) com tipo, titular, número e observações. Persiste no navegador na Fase
 * Front. 100% em PT-BR.
 *
 * Observação de privacidade: nesta fase os dados ficam apenas no seu
 * dispositivo (localStorage). Evite guardar senhas ou dados sensíveis até a
 * Fase Back, quando o armazenamento seguro e a criptografia serão avaliados.
 */

interface Documento {
  id: string;
  tipo: string;
  titular: string;
  numero: string;
  observacao: string;
}

const TIPOS = [
  "Passaporte",
  "RG / CNH",
  "Seguro viagem",
  "Voucher de reserva",
  "Bilhete / Passagem",
  "Visto",
  "Vacina / Saúde",
  "Outro",
] as const;

const novoId = () => Math.random().toString(36).substring(2, 9);

export default function DocumentosPage() {
  const montado = useMontado();
  // Alterações locais ficam neste estado; a leitura inicial vem do localStorage
  // só após a montagem (sem hydration mismatch, sem setState em efeito).
  const [alteracoes, setAlteracoes] = useState<Documento[] | null>(null);
  const salvos = useMemo(
    () => (montado ? readLocal<Documento[]>(STORAGE_KEYS.documentos, []) : []),
    [montado]
  );
  const docs = alteracoes ?? salvos;

  const [form, setForm] = useState<Omit<Documento, "id">>({
    tipo: TIPOS[0],
    titular: "",
    numero: "",
    observacao: "",
  });

  function persistir(next: Documento[]) {
    setAlteracoes(next);
    writeLocal(STORAGE_KEYS.documentos, next);
  }

  const adicionar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titular.trim() && !form.numero.trim()) return;
    persistir([{ id: novoId(), ...form }, ...docs]);
    setForm({ tipo: TIPOS[0], titular: "", numero: "", observacao: "" });
  };
  const remover = (id: string) => persistir(docs.filter((d) => d.id !== id));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          Documentos da Viagem
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Guarde as referências dos documentos para ter tudo à mão durante a viagem.
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-4 flex items-start gap-3 ring-1 ring-[var(--color-border-strong)]">
        <span className="text-lg">🔒</span>
        <p className="text-xs text-[var(--color-muted)]">
          Nesta fase, os dados ficam apenas neste dispositivo. Evite guardar
          senhas ou informações sensíveis até o armazenamento seguro ser
          ativado.
        </p>
      </div>

      {/* Adicionar documento */}
      <form onSubmit={adicionar} className="glass-panel rounded-2xl p-6 space-y-4">
        <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">Adicionar documento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            className="glass-input"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Titular (ex.: nome na reserva)"
            value={form.titular}
            onChange={(e) => setForm({ ...form, titular: e.target.value })}
            className="glass-input"
          />
          <input
            type="text"
            placeholder="Número / código"
            value={form.numero}
            onChange={(e) => setForm({ ...form, numero: e.target.value })}
            className="glass-input"
          />
          <input
            type="text"
            placeholder="Observação (ex.: validade)"
            value={form.observacao}
            onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            className="glass-input"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
        >
          + Guardar documento
        </button>
      </form>

      {/* Lista */}
      {docs.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center text-sm text-[var(--color-muted)]">
          Nenhum documento guardado ainda.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {docs.map((d) => (
            <div key={d.id} className="glass-panel rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-subtle)]">{d.tipo}</span>
                  <p className="mt-1 font-serif text-lg font-bold text-[var(--color-heading)]">{d.titular || "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => remover(d.id)}
                  aria-label="Remover"
                  className="text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)] cursor-pointer"
                >
                  ✕
                </button>
              </div>
              {d.numero && <p className="mt-2 text-sm text-[var(--color-foreground)]">Nº {d.numero}</p>}
              {d.observacao && <p className="mt-1 text-xs text-[var(--color-muted)]">{d.observacao}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

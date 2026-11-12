"use client";

import { useState, useTransition } from "react";
import { salvarPerfil } from "@/app/dashboard/sincronizacao-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readLocal, STORAGE_KEYS } from "@/lib/local-store";
import { normalizarChavePix, ROTULOS_TIPO_CHAVE, TIPOS_CHAVE_PIX, type TipoChavePix } from "@/lib/pix/brcode";
import type { PerfilProprio } from "@/lib/sync/contexto";
import { atualizarContexto, useContextoSync } from "@/lib/sync/motor";

/**
 * Perfil da conta (sincronizado no Postgres, tabela `perfis`).
 *
 * - Nome exibido para o par, cidade/aeroporto base (a Nora usa como origem);
 * - Chave Pix para RECEBER o acerto (o par vê só para pagar);
 * - E-mails: alertas de preço e resumo semanal (dá para desligar).
 *
 * Antes, estes dados ficavam no localStorage e o par nunca os via.
 */

interface Formulario {
  nome: string;
  cidadeBase: string;
  iataBase: string;
  receberPix: boolean;
  tipoPix: TipoChavePix;
  chavePix: string;
  nomeRecebedor: string;
  cidadePix: string;
  emailAlertas: boolean;
  emailResumoSemanal: boolean;
}

function formularioDoPerfil(perfil: PerfilProprio | null): Formulario {
  // Primeira vez: aproveita o que estava nas Configurações antigas (navegador).
  const antigo = readLocal<{ viajante1?: string; nomeConta?: string; cidadeBase?: string; iataBase?: string }>(STORAGE_KEYS.conta, {});
  return {
    nome: perfil?.nome || antigo.viajante1 || "",
    cidadeBase: perfil?.cidadeBase || antigo.cidadeBase || "",
    iataBase: perfil?.iataBase || antigo.iataBase || "",
    receberPix: Boolean(perfil?.pix),
    tipoPix: perfil?.pix?.tipo ?? "email",
    chavePix: perfil?.pix?.chave ?? "",
    nomeRecebedor: perfil?.pix?.nomeRecebedor ?? "",
    cidadePix: perfil?.pix?.cidade ?? "",
    emailAlertas: perfil?.emailAlertas ?? true,
    emailResumoSemanal: perfil?.emailResumoSemanal ?? true,
  };
}

export function AccountForm() {
  const ctx = useContextoSync();
  if (!ctx) {
    return <Card className="p-6 text-sm text-muted">Carregando seu perfil…</Card>;
  }
  if (!ctx.servidorPronto) {
    return (
      <Card className="p-6 text-sm text-muted">
        O perfil (nome, chave Pix e e-mails) fica disponível quando o banco deste ambiente for atualizado.
      </Card>
    );
  }
  // key: recomeça o formulário se o perfil mudar em outro aparelho.
  return <FormularioPerfil key={JSON.stringify(ctx.perfil)} perfil={ctx.perfil} />;
}

function FormularioPerfil({ perfil }: { perfil: PerfilProprio | null }) {
  const ctx = useContextoSync();
  const [form, setForm] = useState<Formulario>(() => formularioDoPerfil(perfil));
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, startSalvar] = useTransition();

  function campo<K extends keyof Formulario>(chave: K, valor: Formulario[K]) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
    setMensagem(null);
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (form.receberPix) {
      const chave = normalizarChavePix(form.tipoPix, form.chavePix);
      if (!chave.ok) return setMensagem({ tipo: "erro", texto: chave.erro });
    }
    startSalvar(async () => {
      try {
        const r = await salvarPerfil({
          nome: form.nome,
          cidadeBase: form.cidadeBase,
          iataBase: form.iataBase,
          pix: form.receberPix
            ? { tipo: form.tipoPix, chave: form.chavePix, nomeRecebedor: form.nomeRecebedor, cidade: form.cidadePix }
            : null,
          emailAlertas: form.emailAlertas,
          emailResumoSemanal: form.emailResumoSemanal,
        });
        if (!r.success) return setMensagem({ tipo: "erro", texto: r.error });
        const perfil = r.data;
        if (ctx) {
          atualizarContexto({
            perfil,
            membros: ctx.membros.map((m) => (m.userId === ctx.userId ? { ...m, nome: perfil.nome, pix: perfil.pix } : m)),
          });
        }
        setMensagem({ tipo: "ok", texto: "Perfil salvo." });
      } catch {
        setMensagem({ tipo: "erro", texto: "Sem conexão: o perfil não foi salvo. Tente de novo quando a internet voltar." });
      }
    });
  }

  return (
    <form onSubmit={salvar} className="space-y-6">
      <Card className="p-6">
        <h2 className="font-serif text-xl font-semibold">Seu perfil</h2>
        <p className="mt-1 text-sm text-muted">Como você aparece para o seu par e de onde costumam sair.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Campo id="nome" rotulo="Seu nome" valor={form.nome} onChange={(v) => campo("nome", v)} maxLength={80} obrigatorio />
          <Campo id="cidadeBase" rotulo="Cidade base (origem)" valor={form.cidadeBase} onChange={(v) => campo("cidadeBase", v)} placeholder="Ex.: Belo Horizonte" maxLength={80} />
          <Campo id="iataBase" rotulo="Aeroporto base (IATA)" valor={form.iataBase} onChange={(v) => campo("iataBase", v.toUpperCase())} placeholder="Ex.: CNF" maxLength={3} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-serif text-xl font-semibold">Receber o acerto pelo Pix</h2>
        <p className="mt-1 text-sm text-muted">
          Com a chave cadastrada, seu par paga o saldo com um “Pix Copia e Cola” gerado no Acerto de Contas. Só ele vê a chave.
        </p>
        <label className="mt-4 inline-flex items-center gap-2 text-sm text-heading">
          <input type="checkbox" checked={form.receberPix} onChange={(e) => campo("receberPix", e.target.checked)} />
          Cadastrar chave Pix
        </label>
        {form.receberPix && (
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="tipoPix" className="mb-1.5 block text-sm font-medium text-muted">Tipo de chave</label>
              <select
                id="tipoPix"
                value={form.tipoPix}
                onChange={(e) => campo("tipoPix", e.target.value as TipoChavePix)}
                className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-heading"
              >
                {TIPOS_CHAVE_PIX.map((t) => (
                  <option key={t} value={t}>{ROTULOS_TIPO_CHAVE[t]}</option>
                ))}
              </select>
            </div>
            <Campo id="chavePix" rotulo="Chave Pix" valor={form.chavePix} onChange={(v) => campo("chavePix", v)} maxLength={120} obrigatorio />
            <Campo id="nomeRecebedor" rotulo="Nome de quem recebe (até 25 letras)" valor={form.nomeRecebedor} onChange={(v) => campo("nomeRecebedor", v)} maxLength={25} obrigatorio />
            <Campo id="cidadePix" rotulo="Cidade (até 15 letras)" valor={form.cidadePix} onChange={(v) => campo("cidadePix", v)} maxLength={15} obrigatorio />
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="font-serif text-xl font-semibold">E-mails</h2>
        <div className="mt-4 space-y-3">
          <label className="flex items-start gap-2 text-sm text-heading">
            <input type="checkbox" className="mt-1" checked={form.emailAlertas} onChange={(e) => campo("emailAlertas", e.target.checked)} />
            <span>
              Alertas de queda de preço
              <span className="block text-xs text-muted">Quando um alerta que você criou chegar ao preço-alvo.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-heading">
            <input type="checkbox" className="mt-1" checked={form.emailResumoSemanal} onChange={(e) => campo("emailResumoSemanal", e.target.checked)} />
            <span>
              Resumo semanal do orçamento da viagem
              <span className="block text-xs text-muted">Toda segunda: gastos da semana, saldo do acerto e o que é só seu.</span>
            </span>
          </label>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {mensagem && (
          <span role={mensagem.tipo === "erro" ? "alert" : "status"} className={`text-sm ${mensagem.tipo === "erro" ? "text-danger" : "text-heading"}`}>
            {mensagem.tipo === "ok" ? "✓ " : ""}
            {mensagem.texto}
          </span>
        )}
        <Button type="submit" variant="primary" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}

function Campo({
  id,
  rotulo,
  valor,
  onChange,
  placeholder,
  maxLength,
  obrigatorio,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  maxLength?: number;
  obrigatorio?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-muted">{rotulo}</label>
      <input
        id={id}
        name={id}
        value={valor}
        placeholder={placeholder}
        maxLength={maxLength}
        required={obrigatorio}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-heading placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/40"
      />
    </div>
  );
}

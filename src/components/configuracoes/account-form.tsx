"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { readLocal, writeLocal, STORAGE_KEYS } from "@/lib/local-store";

/**
 * Formulário funcional de Configurações da conta e preferências de viagem.
 *
 * Os valores são carregados e salvos no navegador (localStorage), com feedback
 * de "salvo". Enquanto a sincronização via Supabase não é ligada para esta
 * área, isso garante que as alterações realmente persistem ao recarregar.
 */

interface ContaConfig {
  nomeConta: string;
  emailParceiro: string;
  viajante1: string;
  viajante2: string;
  cidadeBase: string;
  iataBase: string;
  moeda: string;
  viajantesPadrao: string;
}

const PADRAO: ContaConfig = {
  nomeConta: "Minha Conta",
  emailParceiro: "",
  viajante1: "",
  viajante2: "",
  cidadeBase: "",
  iataBase: "",
  moeda: "Real (R$)",
  viajantesPadrao: "2",
};

export function AccountForm() {
  const [form, setForm] = useState<ContaConfig>(() =>
    readLocal<ContaConfig>(STORAGE_KEYS.conta, PADRAO)
  );
  const [salvo, setSalvo] = useState(false);

  function campo(key: keyof ContaConfig) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm((prev) => ({ ...prev, [key]: e.target.value }));
        setSalvo(false);
      },
    };
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    writeLocal(STORAGE_KEYS.conta, form);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  }

  function cancelar() {
    setForm(readLocal<ContaConfig>(STORAGE_KEYS.conta, PADRAO));
    setSalvo(false);
  }

  return (
    <form onSubmit={salvar} className="space-y-6">
      <Card className="p-6">
        <h2 className="font-serif text-xl font-semibold">Dados da conta</h2>
        <p className="mt-1 text-sm text-muted">Como vocês aparecem no DuoPlanner.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <ControlledField id="nomeConta" label="Nome da conta" {...campo("nomeConta")} />
          <ControlledField id="emailParceiro" label="E-mail do parceiro(a)" type="email" placeholder="parceiro@exemplo.com" {...campo("emailParceiro")} />
          <ControlledField id="viajante1" label="Viajante 1" placeholder="Seu nome" {...campo("viajante1")} />
          <ControlledField id="viajante2" label="Viajante 2" placeholder="Nome do parceiro(a)" {...campo("viajante2")} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-serif text-xl font-semibold">Preferências da viagem</h2>
        <p className="mt-1 text-sm text-muted">Padrões usados ao montar buscas e finanças.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <ControlledField id="cidadeBase" label="Cidade base (origem)" placeholder="Ex.: Belo Horizonte" {...campo("cidadeBase")} />
          <ControlledField id="iataBase" label="Aeroporto base (IATA)" placeholder="Ex.: CNF" {...campo("iataBase")} />
          <ControlledField id="moeda" label="Moeda" {...campo("moeda")} />
          <ControlledField id="viajantesPadrao" label="Viajantes padrão" type="number" {...campo("viajantesPadrao")} />
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {salvo && <span className="text-sm text-[var(--color-heading)]">✓ Alterações salvas</span>}
        <Button type="button" variant="secondary" onClick={cancelar}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary">
          Salvar alterações
        </Button>
      </div>
    </form>
  );
}

/** Field controlado (o Field base é não-controlado; aqui passamos value/onChange). */
function ControlledField({
  id,
  label,
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-muted">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-heading placeholder:text-subtle transition-colors focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-border-strong/40"
      />
    </div>
  );
}

import { PageHeading } from "@/components/dashboard/page-heading";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/**
 * Página de Configurações da conta/dupla.
 * Layout expandido (max-w-4xl) com grid estruturado: dados do casal e
 * preferências da viagem.
 */
export default function ConfiguracoesPage() {
  return (
    <div className="max-w-4xl">
      <PageHeading
        title="Configurações"
        description="Faça a gestão da conta e das preferências da dupla."
      />

      <div className="space-y-6">
        {/* Dados do casal */}
        <section className="glass-surface rounded-2xl p-6">
          <h2 className="font-serif text-xl font-semibold text-[#1C1917]">
            Dados do casal
          </h2>
          <p className="mt-1 text-sm text-[#57534E]">
            Como vocês aparecem no PlannerDuo.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field id="duoName" label="Nome da dupla" defaultValue="A nossa dupla" />
            <Field
              id="partnerEmail"
              label="E-mail do parceiro(a)"
              type="email"
              placeholder="parceiro@exemplo.com"
            />
            <Field id="viajante1" label="Viajante 1" placeholder="Seu nome" />
            <Field id="viajante2" label="Viajante 2" placeholder="Nome do parceiro(a)" />
          </div>
        </section>

        {/* Preferências da viagem */}
        <section className="glass-surface rounded-2xl p-6">
          <h2 className="font-serif text-xl font-semibold text-[#1C1917]">
            Preferências da viagem
          </h2>
          <p className="mt-1 text-sm text-[#57534E]">
            Padrões usados ao montar buscas e finanças.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field
              id="cidadeBase"
              label="Cidade base (origem)"
              placeholder="Ex.: Belo Horizonte"
            />
            <Field
              id="iataBase"
              label="Aeroporto base (IATA)"
              placeholder="Ex.: CNF"
            />
            <Field id="moeda" label="Moeda" defaultValue="Real (R$)" />
            <Field id="viajantes" label="Viajantes padrão" type="number" defaultValue="2" />
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Button variant="secondary">Cancelar</Button>
          <Button variant="primary">Salvar alterações</Button>
        </div>
      </div>
    </div>
  );
}

import { PageHeading } from "@/components/dashboard/page-heading";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/**
 * Página de Configurações da conta.
 * Layout expandido (max-w-4xl) com grid estruturado: dados da conta e
 * preferências da viagem.
 */
export default function ConfiguracoesPage() {
  return (
    <div className="max-w-4xl">
      <PageHeading
        title="Configurações"
        description="Faça a gestão da conta e das preferências de viagem."
      />

      <div className="space-y-6">
        {/* Dados da conta */}
        <section className="glass-surface rounded-2xl p-6">
          <h2 className="font-serif text-xl font-semibold text-heading">
            Dados da conta
          </h2>
          <p className="mt-1 text-sm text-foreground">
            Como você aparece no PlannerDuo.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Field id="accountName" label="Nome da conta" defaultValue="Minha Conta" />
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
          <h2 className="font-serif text-xl font-semibold text-heading">
            Preferências da viagem
          </h2>
          <p className="mt-1 text-sm text-foreground">
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

import { PageHeading } from "@/components/dashboard/page-heading";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

/** Página de definições da conta/dupla (estrutura base). */
export default function DefinicoesPage() {
  return (
    <div className="max-w-2xl">
      <PageHeading
        title="Definições"
        description="Faça a gestão da conta e das preferências da dupla."
      />

      <div className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <Field id="duoName" label="Nome da dupla" defaultValue="A nossa dupla" />
        <Field
          id="partnerEmail"
          label="E-mail do parceiro(a)"
          type="email"
          placeholder="parceiro@exemplo.com"
        />
        <Button variant="primary">Guardar alterações</Button>
      </div>
    </div>
  );
}

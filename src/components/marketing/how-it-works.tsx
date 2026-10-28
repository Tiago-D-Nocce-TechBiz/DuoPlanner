import { Container } from "@/components/ui/container";

const STEPS = [
  {
    n: "01",
    title: "Diga para onde vão",
    description:
      "Preencha origem, destino e datas nos motores de busca. Simples e rápido.",
  },
  {
    n: "02",
    title: "Receba as opções",
    description:
      "O PlannerDuo monta links prontos para os melhores sites de voos e hospedagens.",
  },
  {
    n: "03",
    title: "Reserve e organize",
    description:
      "Clique, reserve no parceiro e volte para montar o roteiro e as finanças da dupla.",
  },
] as const;

/** Seção explicativa do fluxo em 3 passos. */
export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="border-y border-sand-border py-20"
    >
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-4xl font-bold text-heading md:text-5xl">
            Como funciona
          </h2>
          <p className="mt-4 text-foreground">
            Três passos entre a vontade de viajar e o plano pronto.
          </p>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="glass-surface rounded-2xl p-6">
              <span className="font-serif text-6xl font-bold text-leather/40">
                {step.n}
              </span>
              <h3 className="mt-3 font-serif text-2xl font-semibold text-heading">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

import { Container } from "@/components/ui/container";

const STEPS = [
  {
    n: "01",
    title: "Diga para onde vão",
    description:
      "Preencha origem, destino e datas no motor de busca. Simples e rápido.",
  },
  {
    n: "02",
    title: "Receba as opções",
    description:
      "O PlannerDuo monta links prontos para os melhores sites de voos e estadias.",
  },
  {
    n: "03",
    title: "Reserve e organize",
    description:
      "Clique, reserve no parceiro e volte para montar o roteiro e as finanças da dupla.",
  },
] as const;

/** Secção explicativa do fluxo em 3 passos. */
export function HowItWorks() {
  return (
    <section id="como-funciona" className="border-y border-zinc-800 bg-zinc-900/40 py-20">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-3xl font-bold text-zinc-50 md:text-4xl">
            Como funciona
          </h2>
          <p className="mt-4 text-zinc-400">
            Três passos entre a vontade de viajar e o plano pronto.
          </p>
        </div>
        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="relative">
              <span className="font-serif text-5xl font-bold text-zinc-800">
                {step.n}
              </span>
              <h3 className="mt-3 font-serif text-xl font-semibold text-zinc-100">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

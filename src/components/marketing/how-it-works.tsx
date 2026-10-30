import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";

const STEPS = [
  {
    n: "01",
    title: "Diga para onde vão",
    description:
      "Informe destino e uma janela de datas. A memória da dupla completa orçamento e limites de escala.",
  },
  {
    n: "02",
    title: "Receba as melhores opções",
    description:
      "O DuoPlanner consulta Kiwi.com e Booking.com, ordena por preço e custo-benefício e sugere passeios baratos.",
  },
  {
    n: "03",
    title: "Reserve e organize",
    description:
      "Reserve direto no parceiro e volte para registrar os gastos: um recibo fotografado vira despesa.",
  },
] as const;

/** Seção explicativa do fluxo em 3 passos. */
export function HowItWorks() {
  return (
    <section id="como-funciona" className="border-y border-border py-20">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-4xl font-semibold md:text-5xl">Como funciona</h2>
          <p className="mt-4 text-muted">
            Três passos entre a vontade de viajar e o plano pronto.
          </p>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.n} className="p-6">
              <span className="font-serif text-5xl font-semibold text-zinc-700">{step.n}</span>
              <h3 className="mt-3 font-serif text-2xl font-semibold text-heading">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{step.description}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

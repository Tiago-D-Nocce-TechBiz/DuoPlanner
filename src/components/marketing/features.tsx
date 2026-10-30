import { Brain, Compass, Hotel, Plane, ScanLine, ShieldCheck } from "@/components/ui/icons";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";

const FEATURES = [
  {
    icon: Plane,
    title: "Buscar Viagem",
    description:
      "Passagens reais da Kiwi.com com janela de datas flexível e combinações de companhias low-cost.",
  },
  {
    icon: Hotel,
    title: "Buscar Hospedagem",
    description:
      "Booking.com com o preço total para a dupla, ordenado pelo melhor custo-benefício entre nota e preço.",
  },
  {
    icon: Compass,
    title: "Experiências ocultas",
    description:
      "A cada destino, a IA sugere 3 atividades gratuitas ou de baixo custo fora do roteiro óbvio.",
  },
  {
    icon: ScanLine,
    title: "Recibos com IA",
    description:
      "Fotografe a nota fiscal: o Gemini lê título, valor e data e lança a despesa nas Finanças Duo.",
  },
  {
    icon: Brain,
    title: "Memória da dupla",
    description:
      "Conte uma vez o orçamento e o limite de escalas. A IA lembra e aplica nas próximas buscas.",
  },
  {
    icon: ShieldCheck,
    title: "Pessoal e gratuito",
    description:
      "Sem fins corporativos, sem custos. Seus planos são só seus, com dados protegidos pela LGPD.",
  },
] as const;

/** Grade de recursos. */
export function Features() {
  return (
    <section id="recursos" className="py-20">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-4xl font-semibold md:text-5xl">
            Tudo o que uma dupla precisa para viajar
          </h2>
          <p className="mt-4 text-muted">
            Do primeiro clique na pesquisa à divisão da conta no fim da viagem.
          </p>
        </div>
        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="p-6 transition-colors hover:border-border-strong">
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-elevated">
                <Icon className="h-5 w-5 text-heading" />
              </span>
              <h3 className="font-serif text-xl font-semibold text-heading">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground">{description}</p>
            </Card>
          ))}
        </div>
      </Container>
    </section>
  );
}

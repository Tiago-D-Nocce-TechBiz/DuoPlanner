import { Container } from "@/components/ui/container";
import {
  Plane,
  Hotel,
  Map,
  Wallet,
  ScanLine,
  ShieldCheck,
} from "lucide-react";

const FEATURES = [
  {
    icon: Plane,
    title: "Buscar Viagem",
    description:
      "Informe origem, destino e datas. Geramos links prontos para LATAM, Azul, GOL, Google Flights e Skyscanner.",
  },
  {
    icon: Hotel,
    title: "Buscar Hospedagem",
    description:
      "Encontre hotéis e estadias no Airbnb, Booking.com, Hoteis.com e Trivago, já com suas datas.",
  },
  {
    icon: Map,
    title: "Roteiro organizado",
    description:
      "Monte o itinerário dia a dia e mantenha tudo acessível para os dois viajantes.",
  },
  {
    icon: Wallet,
    title: "Finanças Duo",
    description:
      "Acompanhe os gastos da viagem a dois, divida contas e veja quanto cada um já colocou.",
  },
  {
    icon: ScanLine,
    title: "Notas com IA",
    description:
      "Em breve: escaneie notas fiscais e recibos com visão por IA (OCR) e registre despesas automaticamente.",
  },
  {
    icon: ShieldCheck,
    title: "Pessoal e gratuito",
    description:
      "Sem fins corporativos, sem custos. Seus planos de viagem são só seus, com dados protegidos pela LGPD.",
  },
] as const;

/** Grade de recursos translúcidos. */
export function Features() {
  return (
    <section id="recursos" className="py-20">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-4xl font-bold text-heading md:text-5xl">
            Tudo o que uma dupla precisa para viajar
          </h2>
          <p className="mt-4 text-foreground">
            Do primeiro clique na pesquisa à divisão da conta no fim da viagem.
          </p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="glass-surface rounded-2xl p-6 transition-colors hover:ring-leather/30"
            >
              <div className="mb-4 inline-flex rounded-xl border border-sand-border bg-sand-surface p-3">
                <Icon className="h-6 w-6 text-heading" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-heading">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

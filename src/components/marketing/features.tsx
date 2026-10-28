import { Container } from "@/components/ui/container";
import {
  Search,
  Map,
  Wallet,
  ScanLine,
  Users,
  ShieldCheck,
} from "lucide-react";

const FEATURES = [
  {
    icon: Search,
    title: "Motor de busca inteligente",
    description:
      "Informe origem, destino e datas. O PlannerDuo gera links já preenchidos para Airbnb, Booking, LATAM, Azul e GOL — abre direto na página de resultados.",
  },
  {
    icon: Map,
    title: "Roteiro organizado",
    description:
      "Monte o itinerário dia a dia, guarde ideias e mantenha tudo acessível para os dois viajantes.",
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
    icon: Users,
    title: "Feito para duplas",
    description:
      "Pensado para quem viaja em par: casais, amigos ou companheiros de aventura.",
  },
  {
    icon: ShieldCheck,
    title: "Pessoal e gratuito",
    description:
      "Sem fins corporativos, sem custos. Os seus planos de viagem são só seus.",
  },
] as const;

/** Grelha de recursos da plataforma. */
export function Features() {
  return (
    <section id="recursos" className="py-20">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-4xl font-bold text-[#1C1917] md:text-5xl">
            Tudo o que uma dupla precisa para viajar
          </h2>
          <p className="mt-4 text-[#57534E]">
            Do primeiro clique na pesquisa à divisão da conta no fim da viagem.
          </p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="glass-surface rounded-2xl p-6 transition-colors hover:ring-[#8C7A6B]/30"
            >
              <div className="mb-4 inline-flex rounded-xl border border-[#DFD9CE] bg-[#EFECE6] p-3">
                <Icon className="h-6 w-6 text-[#1C1917]" />
              </div>
              <h3 className="font-serif text-xl font-semibold text-[#1C1917]">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
                {description}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

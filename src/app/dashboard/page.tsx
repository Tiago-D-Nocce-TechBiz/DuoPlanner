import Link from "next/link";
import { ArrowRight, Brain, Hotel, Plane, Wallet } from "lucide-react";
import { PageHeading } from "@/components/dashboard/page-heading";
import { cardClass, Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  {
    href: "/dashboard/buscar-viagem",
    title: "Buscar Viagem",
    description: "Passagens da Kiwi.com com datas flexíveis e combinações low-cost.",
    icon: Plane,
  },
  {
    href: "/dashboard/buscar-hospedagem",
    title: "Buscar Hospedagem",
    description: "Booking.com com preço total para a dupla e ranking de custo-benefício.",
    icon: Hotel,
  },
  {
    href: "/dashboard/financas",
    title: "Finanças Duo",
    description: "Escaneie recibos com IA e divida as contas da viagem.",
    icon: Wallet,
  },
];

/** Visão geral do dashboard. */
export default function DashboardHome() {
  return (
    <div>
      <PageHeading
        title="Olá, viajantes"
        description="Por onde a próxima aventura a dois vai começar?"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_ACTIONS.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              cardClass,
              "group p-6 transition-colors hover:border-border-strong"
            )}
          >
            <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-elevated">
              <Icon className="h-5 w-5 text-heading" />
            </span>
            <h2 className="font-serif text-xl font-semibold">{title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">{description}</p>
            <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors group-hover:text-heading">
              Abrir
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      <Card className="mt-6 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-elevated">
            <Brain className="h-5 w-5 text-heading" />
          </span>
          <div>
            <h2 className="font-serif text-xl font-semibold">A IA lembra de vocês</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">
              Conte uma vez o orçamento, o limite de escalas e o que a dupla
              gosta de fazer: as próximas buscas já vêm filtradas.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/configuracoes"
          className="shrink-0 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
        >
          Ensinar preferências →
        </Link>
      </Card>
    </div>
  );
}

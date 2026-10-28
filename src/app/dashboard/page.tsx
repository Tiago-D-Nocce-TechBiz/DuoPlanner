import Link from "next/link";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Plane, Hotel, Wallet, ArrowRight } from "lucide-react";

const QUICK_ACTIONS = [
  {
    href: "/dashboard/buscar-viagem",
    title: "Buscar Viagem",
    description: "Gere links de voos prontos para os melhores sites.",
    icon: Plane,
  },
  {
    href: "/dashboard/buscar-hospedagem",
    title: "Buscar Hospedagem",
    description: "Encontre hotéis e estadias nas suas datas.",
    icon: Hotel,
  },
  {
    href: "/dashboard/financas",
    title: "Controlar finanças",
    description: "Registre despesas e divida as contas.",
    icon: Wallet,
  },
];

/** Visão geral do dashboard. */
export default function DashboardHome() {
  return (
    <div>
      <PageHeading
        title="Olá, viajantes 👋"
        description="Por onde a próxima aventura vai começar?"
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_ACTIONS.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="glass-surface group rounded-2xl p-6 transition-colors hover:ring-leather/30"
          >
            <div className="mb-4 inline-flex rounded-xl border border-sand-border bg-sand-surface p-3">
              <Icon className="h-6 w-6 text-heading" />
            </div>
            <h2 className="font-serif text-xl font-semibold text-heading">
              {title}
            </h2>
            <p className="mt-1.5 text-sm text-foreground">{description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-leather">
              Abrir
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      <div className="glass-surface mt-8 rounded-2xl p-6">
        <h2 className="font-serif text-xl font-semibold text-heading">
          Próxima viagem
        </h2>
        <p className="mt-1.5 text-sm text-foreground">
          Ainda não há viagens planejadas. Comece por{" "}
          <Link
            href="/dashboard/buscar-viagem"
            className="font-medium text-leather hover:underline"
          >
            Buscar Viagem
          </Link>{" "}
          ou{" "}
          <Link
            href="/dashboard/buscar-hospedagem"
            className="font-medium text-leather hover:underline"
          >
            Buscar Hospedagem
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

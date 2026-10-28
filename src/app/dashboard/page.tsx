import Link from "next/link";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Search, Map, Wallet, ArrowRight } from "lucide-react";

const QUICK_ACTIONS = [
  {
    href: "/dashboard/busca",
    title: "Procurar voos e estadias",
    description: "Gere links prontos para os melhores sites.",
    icon: Search,
  },
  {
    href: "/dashboard/roteiro",
    title: "Montar roteiro",
    description: "Organize os dias da viagem a dois.",
    icon: Map,
  },
  {
    href: "/dashboard/financas",
    title: "Controlar finanças",
    description: "Registe despesas e divida as contas.",
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
            className="group rounded-2xl border border-zinc-800 bg-zinc-900 p-6 transition-colors hover:border-zinc-700"
          >
            <div className="mb-4 inline-flex rounded-xl border border-zinc-800 bg-zinc-950 p-3">
              <Icon className="h-6 w-6 text-accent" />
            </div>
            <h2 className="font-serif text-lg font-semibold text-zinc-100">
              {title}
            </h2>
            <p className="mt-1.5 text-sm text-zinc-400">{description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-accent">
              Abrir
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="font-serif text-lg font-semibold text-zinc-100">
          Próxima viagem
        </h2>
        <p className="mt-1.5 text-sm text-zinc-400">
          Ainda não há viagens planeadas. Comece pela{" "}
          <Link href="/dashboard/busca" className="text-accent hover:underline">
            busca de voos e estadias
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

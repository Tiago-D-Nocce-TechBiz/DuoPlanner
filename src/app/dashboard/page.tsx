import Link from "next/link";
import { PageHeading } from "@/components/dashboard/page-heading";
import { Search, Map, Wallet, ArrowRight } from "lucide-react";

const QUICK_ACTIONS = [
  {
    href: "/dashboard/busca",
    title: "Procurar voos e hospedagens",
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
    description: "Registre despesas e divida as contas.",
    icon: Wallet,
  },
];

const cardClass =
  "glass-surface group rounded-2xl p-6 transition-colors hover:ring-[#8C7A6B]/30";

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
          <Link key={href} href={href} className={cardClass}>
            <div className="mb-4 inline-flex rounded-xl border border-[#DFD9CE] bg-[#EFECE6] p-3">
              <Icon className="h-6 w-6 text-[#1C1917]" />
            </div>
            <h2 className="font-serif text-xl font-semibold text-[#1C1917]">
              {title}
            </h2>
            <p className="mt-1.5 text-sm text-[#57534E]">{description}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#8C7A6B]">
              Abrir
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      <div className="glass-surface mt-8 rounded-2xl p-6">
        <h2 className="font-serif text-xl font-semibold text-[#1C1917]">
          Próxima viagem
        </h2>
        <p className="mt-1.5 text-sm text-[#57534E]">
          Ainda não há viagens planejadas. Comece pela{" "}
          <Link
            href="/dashboard/busca"
            className="font-medium text-[#8C7A6B] hover:underline"
          >
            busca de voos e hospedagens
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

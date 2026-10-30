"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConciergeBox, type ConciergeModo } from "@/components/search/concierge-box";
import type { ConciergeParse } from "@/lib/concierge";
import { writeLocal, STORAGE_KEYS } from "@/lib/local-store";

const ATALHOS_PAINEL = [
  {
    icone: "✈️",
    titulo: "Buscar Passagens",
    descricao:
      "Links pré-preenchidos para LATAM, Azul, GOL, Google Flights, Skyscanner e viações de ônibus.",
    href: "/dashboard/buscar-viagem",
    acao: "Abrir buscador de passagens →",
  },
  {
    icone: "🏨",
    titulo: "Buscar Hospedagem",
    descricao:
      "Compare acomodações no Airbnb, Booking.com, Hoteis.com, Trivago, Decolar e Vrbo com suas datas.",
    href: "/dashboard/buscar-hospedagem",
    acao: "Abrir buscador de hospedagem →",
  },
  {
    icone: "💳",
    titulo: "Finanças Duo",
    descricao:
      "Importe uma fatura ou lance gastos, separe o que é pessoal e divida apenas as despesas da viagem.",
    href: "/dashboard/financas",
    acao: "Gerenciar finanças da dupla →",
  },
];

export default function DashboardOverviewPage() {
  const router = useRouter();

  // O Concierge na página principal: salva o que entendeu e leva o usuário
  // para a busca de passagens ou hospedagem, conforme o modo escolhido.
  function aoInterpretar(dados: ConciergeParse, modo: ConciergeModo) {
    writeLocal(STORAGE_KEYS.concierge, { dados, modo, ts: Date.now() });
    router.push(modo === "hospedagem" ? "/dashboard/buscar-hospedagem" : "/dashboard/buscar-viagem");
  }

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <section className="glass-panel rounded-3xl p-6 sm:p-8">
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          Olá, viajantes 👋
        </h1>
        <p className="mt-2 text-sm sm:text-base text-[var(--color-muted)] max-w-2xl">
          Por onde a próxima aventura a dois vai começar? Descreva a viagem abaixo e deixe o
          Concierge montar a busca — ou escolha uma das áreas.
        </p>
      </section>

      {/* Concierge de IA — uso livre para passagens ou hospedagem */}
      <ConciergeBox comModos onInterpretar={aoInterpretar} />

      {/* Atalhos principais */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {ATALHOS_PAINEL.map((card) => (
          <Link
            className="glass-panel duo-ticket-card rounded-2xl p-6 flex flex-col justify-between group"
            href={card.href}
            key={card.titulo}
          >
            <div>
              <div className="h-11 w-11 rounded-xl glass-panel flex items-center justify-center text-xl">
                {card.icone}
              </div>
              <h2 className="mt-4 font-serif text-xl font-bold text-[var(--color-heading)]">
                {card.titulo}
              </h2>
              <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">
                {card.descricao}
              </p>
            </div>
            <div className="mt-6 pt-3 border-t border-dashed border-[var(--color-border)] text-xs font-semibold text-[var(--color-heading)]">
              {card.acao}
            </div>
          </Link>
        ))}
      </section>

      {/* Ferramentas da viagem — acesso rápido às funcionalidades */}
      <section>
        <h2 className="mb-4 font-serif text-xl font-bold text-[var(--color-heading)]">
          Ferramentas da viagem
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {FERRAMENTAS.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="glass-panel rounded-2xl p-4 flex flex-col items-center gap-2 text-center hover:ring-1 hover:ring-[var(--color-border-strong)] transition-all"
            >
              <span className="text-2xl">{f.icone}</span>
              <span className="text-xs font-semibold text-[var(--color-heading)]">{f.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

const FERRAMENTAS = [
  { href: "/dashboard/roteiro", label: "Roteiro", icone: "🗺️" },
  { href: "/dashboard/checklist", label: "Checklist", icone: "🧳" },
  { href: "/dashboard/documentos", label: "Documentos", icone: "📄" },
  { href: "/dashboard/acerto", label: "Acerto de Contas", icone: "🤝" },
  { href: "/dashboard/conversor", label: "Conversor", icone: "💱" },
  { href: "/dashboard/configuracoes", label: "Configurações", icone: "⚙️" },
];

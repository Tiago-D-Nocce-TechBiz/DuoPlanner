"use client";

import Link from "next/link";

const ATALHOS_PAINEL = [
  {
    codigo: "PASSAGENS • AÉREO & ÔNIBUS",
    icone: "✈️",
    titulo: "Buscar Passagens",
    descricao:
      "Gere links pré-preenchidos para LATAM, Azul, GOL, Google Flights, Guanabara, Buser, Viação UTIL e ClickBus.",
    href: "/dashboard/buscar-viagem",
    acao: "Abrir buscador de passagens →",
  },
  {
    codigo: "ESTADIAS • HOTÉIS & TEMPORADA",
    icone: "🏨",
    titulo: "Buscar Hospedagem",
    descricao:
      "Compare acomodações no Airbnb, Booking.com, Hoteis.com, Trivago, Decolar e Vrbo já com check-in e hóspedes.",
    href: "/dashboard/buscar-hospedagem",
    acao: "Abrir buscador de hospedagem →",
  },
  {
    codigo: "FINANÇAS • NUBANK & NF",
    icone: "💳",
    titulo: "Finanças Duo",
    descricao:
      "Importe faturas CSV do Nubank ou Notas Fiscais, oculte gastos pessoais e divida apenas as despesas da viagem.",
    href: "/dashboard/financas",
    acao: "Gerenciar finanças da dupla →",
  },
];

export default function DashboardOverviewPage() {
  return (
    <div className="space-y-8">
      <section className="glass-panel duo-ticket-card rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-black/5 dark:bg-white/10 px-3 py-1 text-xs font-mono uppercase tracking-wider text-[var(--color-muted)] mb-3">
              <span>🧭 PASSAPORTE DUO ATIVO</span>
              <span>•</span>
              <span>SINCRONIZADO EM NUVEM</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
              Olá, viajantes 👋
            </h1>
            <p className="mt-2 text-sm sm:text-base text-[var(--color-muted)] max-w-2xl">
              Por onde a próxima aventura a dois vai começar? Escolha seu destino, compare voos, ônibus e pousadas, e mantenha o orçamento compartilhado sob controle.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
            <div className="glass-panel rounded-2xl p-3.5">
              <span className="text-[10px] font-mono uppercase text-[var(--color-subtle)]">
                MODAIS DISPONÍVEIS
              </span>
              <p className="mt-1 font-serif text-lg font-bold text-[var(--color-heading)]">
                Voos & Ônibus
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-3.5">
              <span className="text-[10px] font-mono uppercase text-[var(--color-subtle)]">
                PRIVACIDADE LGPD
              </span>
              <p className="mt-1 font-serif text-lg font-bold text-[var(--color-heading)]">
                Triagem Ativa
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {ATALHOS_PAINEL.map((card) => (
          <Link
            className="glass-panel duo-ticket-card rounded-2xl p-6 flex flex-col justify-between group"
            href={card.href}
            key={card.titulo}
          >
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--color-subtle)]">
                {card.codigo}
              </span>

              <div className="mt-3 h-11 w-11 rounded-xl glass-panel flex items-center justify-center text-xl">
                {card.icone}
              </div>

              <h2 className="mt-4 font-serif text-xl font-bold text-[var(--color-heading)]">
                {card.titulo}
              </h2>
              <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">
                {card.descricao}
              </p>
            </div>

            <div className="mt-6 pt-3 border-t border-dashed border-[var(--color-border)] text-xs font-semibold text-[var(--color-heading)] flex items-center justify-between">
              <span>{card.acao}</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="glass-panel rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-xl glass-panel flex items-center justify-center text-lg shrink-0">
            🤖
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-[var(--color-heading)]">
              Preferências e Inteligência de Rota
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-[var(--color-muted)]">
              Defina sua cidade de origem padrão (ex.: Belo Horizonte - CNF), orçamento da dupla e deixe o sistema sugerir automaticamente aeroportos próximos e linhas rodoviárias (Guanabara, Buser e UTIL).
            </p>
          </div>
        </div>

        <Link
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] whitespace-nowrap self-start sm:self-center"
          href="/dashboard/configuracoes"
        >
          Configurar preferências →
        </Link>
      </section>
    </div>
  );
}

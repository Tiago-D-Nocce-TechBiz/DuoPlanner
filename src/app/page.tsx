"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { InteractiveFlightRoute } from "@/components/marketing/interactive-flight-route";

// Ano de copyright como constante: evita `new Date()` no prerender
// (Cache Components) e mantém o rodapé totalmente estático.
const COPYRIGHT_YEAR = 2026;

const RECURSOS = [
  {
    codigo: "MOD-01 • AÉREO & RODOVIÁRIO",
    coordenada: "19°55'S 43°56'W",
    icone: "✈️",
    titulo: "Buscar Passagens (Aéreo & Ônibus)",
    descricao:
      "Links diretos pré-preenchidos para LATAM, Azul, GOL, Google Flights, Skyscanner, Guanabara, Buser, Viação UTIL e ClickBus.",
    href: "/dashboard/buscar-viagem",
  },
  {
    codigo: "MOD-02 • ESTADIAS & POUSADAS",
    coordenada: "22°45'S 41°53'W",
    icone: "🏨",
    titulo: "Buscar Hospedagem",
    descricao:
      "Compare estadias perfeitas no Airbnb, Booking.com, Hoteis.com, Trivago, Decolar e Vrbo já com suas datas configuradas.",
    href: "/dashboard/buscar-hospedagem",
  },
  {
    codigo: "MOD-03 • ITINERÁRIO",
    coordenada: "DIA A DIA • SINCRONIZADO",
    icone: "🗺️",
    titulo: "Roteiro Sincronizado",
    descricao:
      "Organize passeios, horários e reservas dia a dia em tempo real entre a sua conta e a pessoa convidada.",
    href: "/dashboard/roteiro",
  },
  {
    codigo: "MOD-04 • DIVISÃO INTELIGENTE",
    coordenada: "CSV NUBANK & NOTA FISCAL",
    icone: "💳",
    titulo: "Finanças Duo & Triagem Nubank",
    descricao:
      "Importe sua fatura CSV do Nubank ou Nota Fiscal, separe gastos pessoais privados e compartilhe apenas as despesas da viagem.",
    href: "/dashboard/financas",
  },
  {
    codigo: "MOD-05 • ASSISTENTE DE ROTA",
    coordenada: "NLP • DEEP LINKING",
    icone: "🤖",
    titulo: "Concierge de IA Integrado",
    descricao:
      "Descreva sua viagem em linguagem natural e deixe o assistente montar automaticamente os melhores links e rotas.",
    href: "/dashboard/buscar-viagem",
  },
  {
    codigo: "MOD-06 • PROTEÇÃO DE DADOS",
    coordenada: "LEI Nº 13.709/2018",
    icone: "🔒",
    titulo: "Privacidade & LGPD",
    descricao:
      "Seus gastos particulares nunca aparecem para o parceiro(a). Transparência total em conformidade com a legislação brasileira.",
    href: "/termos",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between px-4 sm:px-6 lg:px-8 pb-12">
      <header className="sticky top-4 z-50 mx-auto w-full max-w-6xl">
        <nav className="glass-panel rounded-2xl px-5 py-3.5 flex items-center justify-between gap-4 bg-[var(--color-elevated)] shadow-lg">
          <Link
            className="flex items-center gap-2.5 font-serif text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-heading)]"
            href="/"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent)] text-[var(--color-accent-foreground)] text-sm font-sans">
              ✦
            </span>
            <span>PlannerDuo</span>
          </Link>

          <div className="hidden md:flex items-center gap-7 text-sm font-medium text-[var(--color-muted)]">
            <a href="#recursos" className="hover:text-[var(--color-heading)] transition-colors">
              Recursos
            </a>
            <a href="#como-funciona" className="hover:text-[var(--color-heading)] transition-colors">
              Como funciona
            </a>
            <Link className="hover:text-[var(--color-heading)] transition-colors" href="/termos">
              Termos & LGPD
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              className="px-3.5 py-2 rounded-xl text-sm font-medium text-[var(--color-foreground)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              href="/login"
            >
              Entrar
            </Link>
            <Link
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-sm hover:opacity-90 transition-all"
              href="/dashboard"
            >
              Acessar Painel
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl pt-12 sm:pt-16">
        <section className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2.5 rounded-full glass-panel px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-6">
            <span>🧭</span>
            <span>Diário & Cartografia de Viagens a Dois</span>
          </div>

          <h1 className="font-serif text-4xl sm:text-6xl font-bold tracking-tight text-[var(--color-heading)] leading-[1.1]">
            Tudo o que vocês precisam para planejar a próxima viagem
          </h1>

          <p className="mt-5 text-base sm:text-lg text-[var(--color-muted)] leading-relaxed">
            Da pesquisa de passagens aéreas, ônibus e hospedagens até a divisão inteligente da fatura no retorno. Simples, fluido e sincronizado.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              className="px-6 py-3.5 rounded-xl font-semibold text-sm bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-md hover:scale-[1.02] transition-all"
              href="/dashboard"
            >
              Começar planejamento agora →
            </Link>
            <Link
              className="px-6 py-3.5 rounded-xl font-semibold text-sm glass-panel hover:bg-black/5 dark:hover:bg-white/10 transition-all"
              href="/login"
            >
              Entrar na minha conta
            </Link>
          </div>
        </section>

        <InteractiveFlightRoute />

        <section id="recursos" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {RECURSOS.map((item) => (
              <Link
                className="glass-panel duo-ticket-card rounded-2xl p-6 flex flex-col justify-between group"
                href={item.href}
                key={item.titulo}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-wider text-[var(--color-subtle)] mb-4">
                    <span>{item.codigo}</span>
                    <span>{item.coordenada}</span>
                  </div>

                  <div className="h-11 w-11 rounded-xl glass-panel flex items-center justify-center text-xl mb-4 group-hover:scale-105 transition-transform">
                    {item.icone}
                  </div>

                  <h2 className="font-serif text-xl font-semibold text-[var(--color-heading)]">
                    {item.titulo}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">
                    {item.descricao}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-dashed border-[var(--color-border)] flex items-center justify-between text-xs font-semibold text-[var(--color-heading)]">
                  <span>Explorar módulo</span>
                  <span className="group-hover:translate-x-1 transition-transform">→</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section id="como-funciona" className="mt-24 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
            Como funciona a jornada no PlannerDuo
          </h2>
          <p className="mt-2 text-sm sm:text-base text-[var(--color-muted)]">
            Três etapas conectadas entre o desejo de viajar e o acerto justo de contas.
          </p>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="glass-panel duo-ticket-card rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <span className="font-serif text-3xl font-bold text-[var(--color-subtle)]">01</span>
                <span className="text-[11px] font-mono uppercase text-[var(--color-subtle)]">
                  EMBARQUE
                </span>
              </div>
              <h3 className="mt-3 font-serif text-lg font-semibold text-[var(--color-heading)]">
                Busque passagens e estadias
              </h3>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Informe origem, destino e datas ou peça ao Agente de IA. Geramos os links diretos para companhias aéreas, ônibus rodoviários e hospedagens.
              </p>
            </div>

            <div className="glass-panel duo-ticket-card rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <span className="font-serif text-3xl font-bold text-[var(--color-subtle)]">02</span>
                <span className="text-[11px] font-mono uppercase text-[var(--color-subtle)]">
                  CONEXÃO DUO
                </span>
              </div>
              <h3 className="mt-3 font-serif text-lg font-semibold text-[var(--color-heading)]">
                Convide sua parceria
              </h3>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Compartilhe seu código de convite para que os dois visualizem e editem o roteiro e os gastos da viagem em tempo real.
              </p>
            </div>

            <div className="glass-panel duo-ticket-card rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <span className="font-serif text-3xl font-bold text-[var(--color-subtle)]">03</span>
                <span className="text-[11px] font-mono uppercase text-[var(--color-subtle)]">
                  TRIAGEM PRIVADA
                </span>
              </div>
              <h3 className="mt-3 font-serif text-lg font-semibold text-[var(--color-heading)]">
                Separe as contas sem esforço
              </h3>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Importe a fatura do Nubank ou Notas Fiscais, mantenha seus gastos pessoais ocultos e divida apenas o que foi da viagem.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-6xl mt-20 pt-8 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--color-muted)]">
        <span>© {COPYRIGHT_YEAR} PlannerDuo. Todos os direitos reservados.</span>
        <div className="flex items-center gap-6">
          <Link className="hover:underline" href="/termos">
            Termos de Uso & Conformidade LGPD
          </Link>
          <Link className="hover:underline" href="/dashboard">
            Painel de Controle
          </Link>
        </div>
      </footer>
    </div>
  );
}

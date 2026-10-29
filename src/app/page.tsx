"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const RECURSOS = [
  {
    icone: "✈️",
    titulo: "Buscar Passagens (Aéreo & Ônibus)",
    descricao:
      "Links diretos pré-preenchidos para LATAM, Azul, GOL, Google Flights, Skyscanner, Guanabara, Buser, Viação UTIL e ClickBus.",
  },
  {
    icone: "🏨",
    titulo: "Buscar Hospedagem",
    descricao:
      "Compare estadias perfeitas no Airbnb, Booking.com, Hoteis.com, Trivago, Decolar e Vrbo já com suas datas configuradas.",
  },
  {
    icone: "🗺️",
    titulo: "Roteiro Sincronizado",
    descricao:
      "Organize passeios, horários e reservas dia a dia em tempo real entre a sua conta e a pessoa convidada.",
  },
  {
    icone: "💳",
    titulo: "Finanças Duo & Triagem Nubank",
    descricao:
      "Importe sua fatura CSV do Nubank ou Nota Fiscal, separe gastos pessoais privados e compartilhe apenas as despesas da viagem.",
  },
  {
    icone: "🤖",
    titulo: "Concierge de IA Integrado",
    descricao:
      "Descreva sua viagem em linguagem natural e deixe o assistente montar automaticamente os melhores links e rotas.",
  },
  {
    icone: "🔒",
    titulo: "Privacidade & LGPD",
    descricao:
      "Seus gastos particulares nunca aparecem para o parceiro(a). Transparência total em conformidade com a Lei nº 13.709/2018.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col justify-between px-4 sm:px-6 lg:px-8 pb-12">
      {/* Barra de Navegação Superior Flutuante (Sem sobrepor o título) */}
      <header className="sticky top-4 z-50 mx-auto w-full max-w-6xl">
        <nav className="glass-panel rounded-2xl px-5 py-3.5 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-heading)]"
          >
            PlannerDuo
          </Link>

          <div className="hidden md:flex items-center gap-7 text-sm font-medium text-[var(--color-muted)]">
            <a href="#recursos" className="hover:text-[var(--color-heading)] transition-colors">
              Recursos
            </a>
            <a href="#como-funciona" className="hover:text-[var(--color-heading)] transition-colors">
              Como funciona
            </a>
            <Link href="/termos" className="hover:text-[var(--color-heading)] transition-colors">
              Termos & LGPD
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="px-3.5 py-2 rounded-xl text-sm font-medium text-[var(--color-foreground)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-sm hover:opacity-90 transition-all"
            >
              Acessar Painel
            </Link>
          </div>
        </nav>
      </header>

      {/* Seção Principal (Hero) */}
      <main className="mx-auto w-full max-w-6xl pt-16 sm:pt-24">
        <section className="text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-2 rounded-full glass-panel px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-6">
            ✨ Planejamento inteligente a dois
          </span>

          <h1 className="font-serif text-4xl sm:text-6xl font-bold tracking-tight text-[var(--color-heading)] leading-[1.12]">
            Tudo o que vocês precisam para planejar a próxima viagem
          </h1>

          <p className="mt-5 text-base sm:text-lg text-[var(--color-muted)] leading-relaxed">
            Da pesquisa de passagens aéreas, ônibus e hospedagens até a divisão inteligente da fatura no retorno. Simples, fluido e sincronizado.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="px-6 py-3.5 rounded-xl font-semibold text-sm bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-md hover:scale-[1.02] transition-all"
            >
              Começar planejamento agora →
            </Link>
            <Link
              href="/login"
              className="px-6 py-3.5 rounded-xl font-semibold text-sm glass-panel hover:bg-black/5 dark:hover:bg-white/10 transition-all"
            >
              Entrar na minha conta
            </Link>
          </div>
        </section>

        {/* Grade de Recursos */}
        <section id="recursos" className="mt-20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {RECURSOS.map((item) => (
              <div
                key={item.titulo}
                className="glass-panel rounded-2xl p-6 transition-transform duration-200 hover:-translate-y-1"
              >
                <div className="h-10 w-10 rounded-xl glass-panel flex items-center justify-center text-lg mb-4">
                  {item.icone}
                </div>
                <h2 className="font-serif text-xl font-semibold text-[var(--color-heading)]">
                  {item.titulo}
                </h2>
                <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">
                  {item.descricao}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Como Funciona */}
        <section id="como-funciona" className="mt-24 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
            Como funciona
          </h2>
          <p className="mt-2 text-sm sm:text-base text-[var(--color-muted)]">
            Três passos entre a vontade de viajar e o plano completo.
          </p>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="glass-panel rounded-2xl p-6">
              <span className="font-serif text-3xl font-bold text-[var(--color-subtle)]">01</span>
              <h3 className="mt-3 font-serif text-lg font-semibold text-[var(--color-heading)]">
                Busque passagens e estadias
              </h3>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Informe origem, destino e datas ou peça ao Agente de IA. Geramos os links diretos para voos, ônibus e hotéis.
              </p>
            </div>

            <div className="glass-panel rounded-2xl p-6">
              <span className="font-serif text-3xl font-bold text-[var(--color-subtle)]">02</span>
              <h3 className="mt-3 font-serif text-lg font-semibold text-[var(--color-heading)]">
                Convide sua parceria
              </h3>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Compartilhe seu código de convite para que os dois visualizem e editem o roteiro e os gastos compartilhados.
              </p>
            </div>

            <div className="glass-panel rounded-2xl p-6">
              <span className="font-serif text-3xl font-bold text-[var(--color-subtle)]">03</span>
              <h3 className="mt-3 font-serif text-lg font-semibold text-[var(--color-heading)]">
                Separe as contas sem esforço
              </h3>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Importe a fatura do Nubank ou Notas Fiscais, oculte seus gastos pessoais e divida apenas o que foi da viagem.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Rodapé */}
      <footer className="mx-auto w-full max-w-6xl mt-20 pt-8 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--color-muted)]">
        <span>© {new Date().getFullYear()} PlannerDuo. Todos os direitos reservados.</span>
        <div className="flex items-center gap-6">
          <Link href="/termos" className="hover:underline">
            Termos de Uso & Conformidade LGPD
          </Link>
          <Link href="/dashboard" className="hover:underline">
            Painel de Controle
          </Link>
        </div>
      </footer>
    </div>
  );
}
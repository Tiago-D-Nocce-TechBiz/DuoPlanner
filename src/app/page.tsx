"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand/logo";
import { FlightRoute3D } from "@/components/marketing/flight-route-3d";
import { QuestionsAccordion } from "@/components/marketing/questions-accordion";
import {
  Reveal,
  RevealStagger,
  RevealItem,
  MaskReveal,
} from "@/components/marketing/motion-reveal";
import {
  Plane,
  Hotel,
  Wallet,
  Map,
  ShieldCheck,
  Users,
  ArrowUpRight,
  type AppIcon,
} from "@/components/ui/icons";

// Ano de copyright como constante: evita `new Date()` no prerender
// (Cache Components) e mantém o rodapé totalmente estático.
const COPYRIGHT_YEAR = 2026;

/**
 * Landing Page — padrão "Brikken+Co Strategic Design Studio".
 *
 * Minimalismo ousado com grade arquitetural visível (linhas-guia precisas),
 * tipografia monumental no wordmark, Bento Grid assimétrico de recursos,
 * acordeão editorial e bloco final de alto contraste. A paleta e o
 * Glassmorphism do DuoPlanner são preservados integralmente (tokens de tema).
 *
 * Toda a vitrine é demonstrativa: qualquer ação leva ao login (as rotas do
 * painel exigem sessão — ver src/proxy.ts).
 */

// Cartões do Bento Grid (vitrine dos recursos). `span` controla a largura na
// grade de 6 colunas; `tall` dá altura dupla para o ritmo assimétrico.
const RECURSOS: {
  indice: string;
  icone: AppIcon;
  titulo: string;
  descricao: string;
  span: string;
  destaque?: boolean;
}[] = [
  {
    indice: "01",
    icone: Plane,
    titulo: "Passagens aéreas e de ônibus",
    descricao:
      "Buscas pré-preenchidas em LATAM, Azul, GOL, Google Flights, Skyscanner e Decolar — mais Guanabara, Buser, UTIL, ClickBus, DeÔnibus, FlixBus, Gontijo e Cometa. Com Helper inteligente de IATA.",
    span: "lg:col-span-4",
    destaque: true,
  },
  {
    indice: "02",
    icone: Hotel,
    titulo: "Hospedagens",
    descricao:
      "Airbnb, Booking, Hoteis.com, Trivago, Decolar, Vrbo, Expedia, Google Hotels, TripAdvisor e Hostelworld, já com suas datas.",
    span: "lg:col-span-2",
  },
  {
    indice: "03",
    icone: Wallet,
    titulo: "Finanças Duo",
    descricao:
      "Divida as despesas da viagem com triagem de privacidade da fatura Nubank (CSV / NF). O pessoal fica pessoal.",
    span: "lg:col-span-2",
  },
  {
    indice: "04",
    icone: Map,
    titulo: "Roteiro sincronizado",
    descricao:
      "Montem o dia a dia da viagem a quatro mãos. As duas contas veem o mesmo plano, atualizado em tempo real.",
    span: "lg:col-span-2",
  },
  {
    indice: "05",
    icone: Users,
    titulo: "Conta compartilhada por convite",
    descricao:
      "Um convite vincula o parceiro ou parceira ao espaço da dupla. Planejem juntos, sem prints nem planilhas soltas.",
    span: "lg:col-span-2",
  },
];

export default function LandingPage() {
  const reduzido = useReducedMotion() ?? false;
  const easeSaida = [0.22, 1, 0.36, 1] as const;

  return (
    <div className="min-h-screen px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="mx-auto w-full max-w-6xl">
        {/* ============================= NAVBAR ============================ */}
        <motion.header
          className="sticky top-4 z-50 mb-8"
          initial={reduzido ? false : { opacity: 0, y: -16 }}
          animate={reduzido ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easeSaida }}
        >
          <nav className="glass-panel rounded-2xl px-5 py-3.5 flex items-center justify-between gap-4 bg-[var(--color-elevated)] shadow-lg">
            <BrandLogo href="/" />
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link
                href="/login"
                className="px-3.5 py-2 rounded-xl text-sm font-medium text-[var(--color-foreground)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                Entrar
              </Link>
              <Link
                href="/login"
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-sm hover:opacity-90 transition-all"
              >
                Criar conta
              </Link>
            </div>
          </nav>
        </motion.header>

        {/* ======================= HERO MONUMENTAL ======================== */}
        <Reveal as="section" className="grid-frame">
          {/* Faixa superior: rótulo editorial + status, dentro da grade. */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b grid-rule px-6 sm:px-10 py-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-subtle)]">
              Planejamento de viagens a dois
            </span>
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-subtle)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Privado · Sincronizado · LGPD
            </span>
          </div>

          {/* Wordmark gigante + manifesto. */}
          <div className="grid lg:grid-cols-12">
            <div className="lg:col-span-12 px-6 sm:px-10 pt-10 sm:pt-14">
              <MaskReveal>
                <h1 className="brand-monumental text-6xl sm:text-8xl lg:text-[7.5rem]">
                  <span className="mono-duo">Duo</span>
                  <span className="mono-planner">Planner</span>
                  <span className="mono-tm">™</span>
                </h1>
              </MaskReveal>
            </div>

            {/* Linha-guia horizontal antes do corpo da Hero. */}
            <div className="lg:col-span-12 mt-8 border-t grid-rule grid lg:grid-cols-12">
              {/* Avião 3D ao centro arquitetural. */}
              <div className="lg:col-span-7 border-b lg:border-b-0 lg:border-r grid-rule p-6 sm:p-8 flex items-center justify-center">
                <FlightRoute3D className="w-full max-w-xl h-56 sm:h-72" />
              </div>

              {/* Manifesto + ações, à direita. */}
              <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between gap-8">
                <p className="text-base sm:text-lg leading-relaxed text-[var(--color-muted)]">
                  Comparem passagens e hospedagens, montem o roteiro e dividam as
                  despesas da viagem — de forma simples, sincronizada e privada.
                  Um só lugar para o casal planejar a próxima aventura.
                </p>

                <div className="flex flex-col gap-3">
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-between gap-3 px-6 py-4 rounded-xl font-semibold text-sm bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-md hover:opacity-90 transition-all"
                  >
                    Começar a planejar
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-between gap-3 px-6 py-4 rounded-xl font-semibold text-sm glass-panel hover:bg-black/5 dark:hover:bg-white/10 transition-all"
                  >
                    Entrar na minha conta
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* ===================== BENTO GRID — RECURSOS ==================== */}
        <section className="mt-8">
          <Reveal className="flex items-end justify-between gap-4 mb-5 px-1">
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-[var(--color-heading)] tracking-tight">
              Tudo para a viagem a dois
            </h2>
            <span className="bento-index text-xs sm:text-sm hidden sm:block">
              Recursos / 05
            </span>
          </Reveal>

          <RevealStagger className="grid grid-cols-1 lg:grid-cols-6 gap-4 auto-rows-[minmax(0,1fr)]">
            {RECURSOS.map((r) => {
              const Icone = r.icone;
              return (
                <RevealItem key={r.indice} className={`${r.span} h-full`}>
                  <Link
                    href="/login"
                    className={`bento-cell group p-6 sm:p-7 flex flex-col justify-between min-h-[200px] h-full ${
                      r.destaque ? "sm:min-h-[240px]" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="h-11 w-11 rounded-xl glass-panel flex items-center justify-center text-[var(--color-heading)]">
                        <Icone className="h-5 w-5" />
                      </span>
                      <span className="bento-index text-base">{r.indice}</span>
                    </div>
                    <div className="mt-6">
                      <h3 className="font-serif text-xl sm:text-2xl font-bold text-[var(--color-heading)] leading-tight">
                        {r.titulo}
                      </h3>
                      <p className="mt-2.5 text-sm leading-relaxed text-[var(--color-muted)]">
                        {r.descricao}
                      </p>
                    </div>
                  </Link>
                </RevealItem>
              );
            })}
          </RevealStagger>
        </section>

        {/* ================= ACORDEÃO — PERGUNTAS / COMO FUNCIONA ========= */}
        <Reveal as="section" className="mt-10 grid lg:grid-cols-12 gap-x-10 gap-y-6">
          <div className="lg:col-span-4">
            <span className="bento-index text-xs sm:text-sm">Perguntas</span>
            <h2 className="mt-2 font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)] tracking-tight leading-tight">
              Como o DuoPlanner funciona
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)] max-w-sm">
              O essencial, direto ao ponto — da busca integrada à privacidade dos
              gastos pessoais.
            </p>
          </div>
          <div className="lg:col-span-8">
            <QuestionsAccordion />
          </div>
        </Reveal>

        {/* ================= BLOCO FINAL DE ALTO CONTRASTE =============== */}
        <Reveal as="section" className="mt-10 rounded-3xl bg-[var(--color-accent)] text-[var(--color-accent-foreground)] overflow-hidden">
          <div className="px-6 sm:px-12 py-14 sm:py-20 flex flex-col items-center text-center gap-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em] opacity-70">
              Comecem agora, juntos
            </span>
            <MaskReveal>
              <h2 className="brand-monumental text-4xl sm:text-6xl lg:text-7xl text-[var(--color-accent-foreground)]">
                A próxima viagem a dois
              </h2>
            </MaskReveal>
            <p className="max-w-xl text-sm sm:text-base leading-relaxed opacity-80">
              Criem a conta compartilhada e planejem passagens, hospedagem,
              roteiro e despesas em um só lugar — sincronizado e privado.
            </p>
            <motion.div
              whileHover={reduzido ? undefined : { scale: 1.02 }}
              whileTap={reduzido ? undefined : { scale: 0.98 }}
              transition={{ duration: 0.25, ease: easeSaida }}
              className="mt-2"
            >
              <Link
                href="/login"
                className="inline-flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-sm bg-[var(--color-background)] text-[var(--color-heading)] shadow-lg transition-transform"
              >
                Criar nossa conta
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </motion.div>
          </div>
        </Reveal>

        {/* ============================= RODAPÉ =========================== */}
        <footer className="mt-8 pt-8 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--color-muted)]">
          <span>© {COPYRIGHT_YEAR} DuoPlanner. Todos os direitos reservados.</span>
          <Link className="inline-flex items-center gap-1.5 hover:text-[var(--color-heading)] transition-colors" href="/termos">
            <ShieldCheck className="h-3.5 w-3.5" />
            Termos de Uso & Conformidade LGPD
          </Link>
        </footer>
      </div>
    </div>
  );
}

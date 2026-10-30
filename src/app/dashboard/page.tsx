"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConciergeBox, type ConciergeModo } from "@/components/search/concierge-box";
import type { ConciergeParse } from "@/lib/concierge";
import { writeLocal, STORAGE_KEYS } from "@/lib/local-store";
import {
  Plane,
  Hotel,
  Wallet,
  Map,
  Luggage,
  FileText,
  Bell,
  Handshake,
  Coins,
  ArrowUpRight,
  type AppIcon,
} from "@/components/ui/icons";

// Atalhos principais em Bento Grid assimétrico (grade de 6 colunas).
const ATALHOS_PAINEL: {
  indice: string;
  icone: AppIcon;
  titulo: string;
  descricao: string;
  href: string;
  acao: string;
  span: string;
}[] = [
  {
    indice: "01",
    icone: Plane,
    titulo: "Buscar Passagens",
    descricao:
      "Links pré-preenchidos para LATAM, Azul, GOL, Google Flights, Skyscanner e viações de ônibus.",
    href: "/dashboard/buscar-viagem",
    acao: "Abrir buscador de passagens",
    span: "lg:col-span-4",
  },
  {
    indice: "02",
    icone: Hotel,
    titulo: "Buscar Hospedagem",
    descricao:
      "Compare acomodações no Airbnb, Booking.com, Hoteis.com, Trivago, Decolar e Vrbo com suas datas.",
    href: "/dashboard/buscar-hospedagem",
    acao: "Abrir buscador de hospedagem",
    span: "lg:col-span-2",
  },
  {
    indice: "03",
    icone: Wallet,
    titulo: "Finanças Duo",
    descricao:
      "Importe uma fatura ou lance gastos, separe o que é pessoal e divida apenas as despesas da viagem.",
    href: "/dashboard/financas",
    acao: "Gerenciar finanças da dupla",
    span: "lg:col-span-6",
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
        <span className="bento-index text-xs sm:text-sm">Visão geral</span>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          Olá, viajantes
        </h1>
        <p className="mt-2 text-sm sm:text-base text-[var(--color-muted)] max-w-2xl">
          Por onde a próxima aventura a dois vai começar? Descreva a viagem abaixo e deixe o
          Concierge montar a busca — ou escolha uma das áreas.
        </p>
      </section>

      {/* Concierge de IA — barra de comando inteligente (passagens ou hospedagem) */}
      <ConciergeBox comModos onInterpretar={aoInterpretar} />

      {/* Atalhos principais — Bento Grid assimétrico */}
      <section>
        <div className="flex items-end justify-between gap-4 mb-4 px-1">
          <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">
            Atalhos principais
          </h2>
          <span className="bento-index text-xs hidden sm:block">Planejar / 03</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
          {ATALHOS_PAINEL.map((card) => {
            const Icone = card.icone;
            return (
              <Link
                className={`bento-cell group p-6 flex flex-col justify-between min-h-[190px] ${card.span}`}
                href={card.href}
                key={card.titulo}
              >
                <div className="flex items-start justify-between">
                  <span className="h-11 w-11 rounded-xl glass-panel flex items-center justify-center text-[var(--color-heading)]">
                    <Icone className="h-5 w-5" />
                  </span>
                  <span className="bento-index text-base">{card.indice}</span>
                </div>
                <div className="mt-5">
                  <h3 className="font-serif text-xl font-bold text-[var(--color-heading)]">
                    {card.titulo}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--color-muted)] leading-relaxed">
                    {card.descricao}
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-dashed border-[var(--color-border)] text-xs font-semibold text-[var(--color-heading)] inline-flex items-center gap-1.5">
                  {card.acao}
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Ferramentas da viagem — acesso rápido às funcionalidades */}
      <section>
        <div className="flex items-end justify-between gap-4 mb-4 px-1">
          <h2 className="font-serif text-xl font-bold text-[var(--color-heading)]">
            Ferramentas da viagem
          </h2>
          <span className="bento-index text-xs hidden sm:block">Acesso rápido / 06</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {FERRAMENTAS.map((f) => {
            const Icone = f.icone;
            return (
              <Link
                key={f.href}
                href={f.href}
                className="bento-cell p-4 flex flex-col items-center gap-2 text-center text-[var(--color-heading)]"
              >
                <Icone className="h-6 w-6" />
                <span className="text-xs font-semibold text-[var(--color-heading)]">{f.label}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

const FERRAMENTAS: { href: string; label: string; icone: AppIcon }[] = [
  { href: "/dashboard/roteiro", label: "Roteiro", icone: Map },
  { href: "/dashboard/checklist", label: "Checklist", icone: Luggage },
  { href: "/dashboard/documentos", label: "Documentos", icone: FileText },
  { href: "/dashboard/alertas", label: "Alertas de Preço", icone: Bell },
  { href: "/dashboard/acerto", label: "Acerto de Contas", icone: Handshake },
  { href: "/dashboard/conversor", label: "Conversor", icone: Coins },
];

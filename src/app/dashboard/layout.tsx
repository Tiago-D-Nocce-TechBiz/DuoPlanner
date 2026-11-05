"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { InviteButton } from "@/components/dashboard/invite-button";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { SairModal } from "@/components/dashboard/sair-modal";
import { BrandLogo } from "@/components/brand/logo";
import { NoraProvider } from "@/components/ai/nora-provider";
import { NoraTrigger } from "@/components/ai/nora-trigger";
import { NoraDrawer } from "@/components/ai/nora-drawer";
import { SincronizacaoProvider } from "@/components/sync/sincronizacao-provider";
import { AvisoSincronizacao } from "@/components/sync/aviso-sincronizacao";
import { IndicadorOffline } from "@/components/pwa/indicador-offline";
import { InstallPwaPrompt } from "@/components/pwa/InstallPwaPrompt";
import { AquecerCacheOffline } from "@/components/pwa/registrar-sw";
import { useStatusSync } from "@/lib/sync/motor";
import {
  LayoutDashboard,
  Plane,
  Hotel,
  Map,
  Luggage,
  FileText,
  Bell,
  Wallet,
  Handshake,
  Coins,
  Settings,
  ShieldCheck,
  LogOut,
  Compass,
  Users,
  type AppIcon,
} from "@/components/ui/icons";

// Menu agrupado por seções para acomodar as novas funcionalidades sem poluir.
// Ícones próprios do sistema (monocromáticos, herdam a cor do texto: pretos no
// tema Claro, brancos no Escuro).
const GRUPOS_MENU: { secao: string; itens: { href: string; label: string; icone: AppIcon }[] }[] = [
  {
    secao: "Planejar",
    itens: [
      { href: "/dashboard", label: "Visão geral", icone: LayoutDashboard },
      { href: "/dashboard/buscar-viagem", label: "Buscar Passagens", icone: Plane },
      { href: "/dashboard/buscar-hospedagem", label: "Buscar Hospedagem", icone: Hotel },
      { href: "/dashboard/roteiro", label: "Roteiro", icone: Map },
      { href: "/dashboard/checklist", label: "Checklist", icone: Luggage },
      { href: "/dashboard/documentos", label: "Documentos", icone: FileText },
      { href: "/dashboard/alertas", label: "Alertas de Preço", icone: Bell },
    ],
  },
  {
    secao: "Finanças",
    itens: [
      { href: "/dashboard/financas", label: "DuoFinance", icone: Wallet },
      { href: "/dashboard/acerto", label: "Acerto de Contas", icone: Handshake },
      { href: "/dashboard/conversor", label: "Conversor de Moedas", icone: Coins },
    ],
  },
  {
    secao: "Conta",
    itens: [
      { href: "/dashboard/configuracoes", label: "Configurações", icone: Settings },
      { href: "/dashboard/sobre", label: "Sobre Nós", icone: Compass },
      { href: "/dashboard/contato", label: "Fale Conosco", icone: Users },
    ],
  },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [modalSairAberto, setModalSairAberto] = useState(false);
  const status = useStatusSync();

  return (
    <NoraProvider>
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar Lateral */}
      <aside className="w-full md:w-64 glass-panel chrome-surface md:min-h-screen flex flex-col justify-between p-4 sm:p-5 shrink-0 border-b md:border-b-0 md:border-r border-[var(--color-border)]">
        <div>
          {/* Logo que pergunta antes de voltar para a Landing Page */}
          <div className="flex items-center justify-between md:block mb-6">
            <button
              type="button"
              onClick={() => setModalSairAberto(true)}
              className="hover:opacity-75 transition-opacity text-left cursor-pointer"
              title="Encerrar sessão e voltar ao início"
            >
              <BrandLogo href={null} />
            </button>
            <div className="md:hidden flex items-center gap-2">
              <ThemeToggle />
            </div>
          </div>

          <nav className="flex md:flex-col gap-4 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {GRUPOS_MENU.map((grupo) => (
              <div key={grupo.secao} className="flex md:flex-col gap-1.5">
                <span className="hidden md:block px-3.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-subtle)]">
                  {grupo.secao}
                </span>
                {grupo.itens.map((item) => {
                  const ativo =
                    item.href === "/dashboard"
                      ? pathname === "/dashboard"
                      : pathname?.startsWith(item.href);
                  const Icone = item.icone;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                        ativo
                          ? "bg-[var(--color-accent)] text-[var(--color-accent-foreground)] shadow-sm"
                          : "text-[var(--color-muted)] hover:text-[var(--color-heading)] hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                    >
                      <Icone className="h-[18px] w-[18px]" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Rodapé da Sidebar: Termos de Uso & LGPD */}
        <div className="hidden md:block pt-4 border-t border-[var(--color-border)]">
          <Link
            href="/termos"
            className="flex items-center gap-2 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-heading)] transition-colors"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Termos de uso & LGPD</span>
          </Link>
        </div>
      </aside>

      {/* Área Principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header Superior */}
        <header className="glass-panel chrome-surface border-b border-[var(--color-border)] px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="text-xs sm:text-sm text-[var(--color-heading)] font-semibold truncate">
            Planejamento de Viagens e Finanças
          </div>

          <div className="flex items-center gap-3">
            <NoraTrigger />
            <InviteButton />
            <NotificationBell />
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
            <button
              type="button"
              onClick={() => setModalSairAberto(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>
        </header>

        {/* Conteúdo da Rota (sincronização do casal: contexto, fila e Realtime) */}
        <main className="flex-1 p-6 sm:p-8 max-w-6xl w-full mx-auto">
          <SincronizacaoProvider>
            <AvisoSincronizacao />
            {children}
          </SincronizacaoProvider>
        </main>
      </div>

      {/* Confirmação ao clicar na logo ou em Sair: limpa os dados deste navegador */}
      <SairModal
        aberto={modalSairAberto}
        onFechar={() => setModalSairAberto(false)}
        pendenciasExtras={status.pendentes}
      />

      {/* Painel lateral da Nora — acessível de qualquer rota do dashboard */}
      <NoraDrawer />

      {/* PWA: estado offline/sincronização, convite de instalação e cache offline */}
      <IndicadorOffline />
      <InstallPwaPrompt />
      <AquecerCacheOffline />
    </div>
    </NoraProvider>
  );
}
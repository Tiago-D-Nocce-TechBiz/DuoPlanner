"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { InviteButton } from "@/components/dashboard/invite-button";
import { BrandLogo } from "@/components/brand/logo";
import { logoutAction } from "@/app/(auth)/actions";

// Menu agrupado por seções para acomodar as novas funcionalidades sem poluir.
const GRUPOS_MENU: { secao: string; itens: { href: string; label: string; icone: string }[] }[] = [
  {
    secao: "Planejar",
    itens: [
      { href: "/dashboard", label: "Visão geral", icone: "⊞" },
      { href: "/dashboard/buscar-viagem", label: "Buscar Passagens", icone: "✈️" },
      { href: "/dashboard/buscar-hospedagem", label: "Buscar Hospedagem", icone: "🏨" },
      { href: "/dashboard/roteiro", label: "Roteiro", icone: "🗺️" },
      { href: "/dashboard/checklist", label: "Checklist", icone: "🧳" },
      { href: "/dashboard/documentos", label: "Documentos", icone: "📄" },
      { href: "/dashboard/alertas", label: "Alertas de Preço", icone: "🔔" },
    ],
  },
  {
    secao: "Finanças",
    itens: [
      { href: "/dashboard/financas", label: "Finanças Duo", icone: "💳" },
      { href: "/dashboard/acerto", label: "Acerto de Contas", icone: "🤝" },
      { href: "/dashboard/conversor", label: "Conversor de Moedas", icone: "💱" },
    ],
  },
  {
    secao: "Conta",
    itens: [
      { href: "/dashboard/configuracoes", label: "Configurações", icone: "⚙️" },
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
  const [saindo, startSaida] = useTransition();

  // Encerra a sessão real no Supabase e volta à Landing Page.
  const confirmarSaida = () => {
    startSaida(async () => {
      await logoutAction();
    });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar Lateral */}
      <aside className="w-full md:w-64 glass-panel md:min-h-screen flex flex-col justify-between p-4 sm:p-5 shrink-0 border-b md:border-b-0 md:border-r border-[var(--color-border)]">
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
                      <span>{item.icone}</span>
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
            <span>🛡️</span>
            <span>Termos de uso & LGPD</span>
          </Link>
        </div>
      </aside>

      {/* Área Principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header Superior */}
        <header className="glass-panel border-b border-[var(--color-border)] px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="text-xs sm:text-sm text-[var(--color-muted)] font-medium truncate">
            Espaço Sincronizado • <span className="text-[var(--color-heading)] font-semibold">Conta Principal & Convidado(a)</span>
          </div>

          <div className="flex items-center gap-3">
            <InviteButton />
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
            <button
              type="button"
              onClick={() => setModalSairAberto(true)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              ↪ Sair
            </button>
          </div>
        </header>

        {/* Conteúdo da Rota */}
        <main className="flex-1 p-6 sm:p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Modal de Confirmação ao Clicar na Logo ou em Sair */}
      {modalSairAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl p-6 max-w-md w-full">
            <h3 className="font-serif text-xl font-bold text-[var(--color-heading)]">
              Deseja realmente encerrar a sessão?
            </h3>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Ao confirmar, sua sessão atual será encerrada e você retornará à página inicial (Landing Page) do PlannerDuo.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalSairAberto(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                Permanecer conectado
              </button>
              <button
                type="button"
                onClick={confirmarSaida}
                disabled={saindo}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer disabled:opacity-60"
              >
                {saindo ? "Encerrando…" : "Sim, encerrar e ir ao início"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
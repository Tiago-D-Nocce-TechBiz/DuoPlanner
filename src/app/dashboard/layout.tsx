"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const MENU_ITENS = [
  { href: "/dashboard", label: "Visão geral", icone: "⊞" },
  { href: "/dashboard/buscar-viagem", label: "Buscar Passagens", icone: "✈️" },
  { href: "/dashboard/buscar-hospedagem", label: "Buscar Hospedagem", icone: "🏨" },
  { href: "/dashboard/roteiro", label: "Roteiro", icone: "🗺️" },
  { href: "/dashboard/financas", label: "Finanças Duo", icone: "💳" },
  { href: "/dashboard/configuracoes", label: "Configurações", icone: "⚙️" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [modalSairAberto, setModalSairAberto] = useState(false);
  const [modalConviteAberto, setModalConviteAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const linkConvite =
    typeof window !== "undefined"
      ? `${window.location.origin}/login?convite=DUO-BH-2027`
      : "https://plannerduo-vert.vercel.app/login?convite=DUO-BH-2027";

  const copiarConvite = () => {
    navigator.clipboard.writeText(linkConvite);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  const confirmarSaida = () => {
    setModalSairAberto(false);
    router.push("/");
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
              className="font-serif text-2xl font-bold tracking-tight text-[var(--color-heading)] hover:opacity-75 transition-opacity text-left cursor-pointer"
              title="Voltar para a página inicial"
            >
              PlannerDuo
            </button>
            <div className="md:hidden flex items-center gap-2">
              <ThemeToggle />
            </div>
          </div>

          <nav className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
            {MENU_ITENS.map((item) => {
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
            <button
              type="button"
              onClick={() => setModalConviteAberto(true)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold glass-panel hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              + Convidar Parceiro(a)
            </button>
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
              Deseja realmente sair do login?
            </h3>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Ao confirmar, sua sessão atual será encerrada e você será direcionado para a página inicial (Landing Page) do PlannerDuo.
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
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
              >
                Sim, sair e ir para a Landing Page
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Convite para Sincronizar Conta com Parceiro(a) */}
      {modalConviteAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="glass-panel rounded-2xl p-6 max-w-md w-full">
            <h3 className="font-serif text-xl font-bold text-[var(--color-heading)]">
              Convidar para Planejamento Compartilhado
            </h3>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Envie o link abaixo para quem vai viajar com você. Apenas os gastos marcados como <strong>Gasto da Viagem (Compartilhado)</strong> serão visíveis entre as duas contas.
            </p>
            <div className="mt-4">
              <input
                type="text"
                readOnly
                value={linkConvite}
                className="glass-input text-xs"
              />
            </div>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalConviteAberto(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold glass-panel cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={copiarConvite}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
              >
                {copiado ? "✓ Link Copiado!" : "Copiar Link de Convite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
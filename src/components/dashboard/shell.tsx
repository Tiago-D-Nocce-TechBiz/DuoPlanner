"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { DashboardHeader } from "./DashboardHeader";

/**
 * Shell da área autenticada: compõe Sidebar + DashboardHeader + conteúdo.
 * Mantém o estado de abertura da Sidebar em mobile (colapsável).
 * É um client component porque gere interação/estado; as páginas internas
 * continuam a ser Server Components passados como `children`.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-dvh flex-1">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Deslocamento para compensar a Sidebar fixa em telas grandes */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <DashboardHeader onMenu={() => setSidebarOpen(true)} />
        <main className="flex-1 p-4 lg:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

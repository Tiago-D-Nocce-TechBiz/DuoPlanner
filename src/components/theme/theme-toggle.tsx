"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "@/components/ui/icons";

/**
 * Botão de alternância de tema (Sol/Lua), 100% em PT-BR.
 *
 * Usa `useSyncExternalStore` para ler o tema atual diretamente do DOM/sistema
 * externo (a classe `.dark` no <html>, aplicada pelo script anti-flash do
 * layout), evitando setState dentro de efeitos. A preferência persiste em
 * localStorage["duoplanner-theme"]. O padrão inicial é o Modo Claro.
 */

type Theme = "light" | "dark";

function assinar(callback: () => void): () => void {
  // Observa mudanças de classe no <html> para refletir o tema no botão.
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function lerTema(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeToggle() {
  // No servidor devolvemos "light" (snapshot do servidor); o script anti-flash
  // já aplicou o tema certo antes da hidratação.
  const tema = useSyncExternalStore(assinar, lerTema, () => "light" as Theme);
  const isDark = tema === "dark";

  const toggleTheme = () => {
    const proximo: Theme = isDark ? "light" : "dark";
    document.documentElement.classList.toggle("dark", proximo === "dark");
    try {
      localStorage.setItem("duoplanner-theme", proximo);
    } catch {
      // localStorage pode estar indisponível (modo privado); ignorar.
    }
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full glass-panel text-[var(--color-heading)] transition-transform hover:scale-105 active:scale-95 cursor-pointer"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

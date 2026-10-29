"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("plannerduo-theme");
    const root = document.documentElement;
    if (saved === "dark") {
      root.classList.add("dark");
      setIsDark(true);
    } else {
      root.classList.remove("dark");
      setIsDark(false);
    }
  }, []);

  const toggleTheme = () => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.remove("dark");
      localStorage.setItem("plannerduo-theme", "light");
      setIsDark(false);
    } else {
      root.classList.add("dark");
      localStorage.setItem("plannerduo-theme", "dark");
      setIsDark(true);
    }
  };

  if (!mounted) {
    return (
      <div className="h-9 w-9 rounded-full border border-[var(--color-border)] bg-[var(--color-card)]" />
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Mudar para modo claro" : "Mudar para modo escuro"}
      aria-label="Alternar tema claro ou escuro"
      className="inline-flex h-9 w-9 items-center justify-center rounded-full glass-panel text-sm font-medium transition-transform hover:scale-105 active:scale-95 cursor-pointer"
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
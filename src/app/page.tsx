'use client';

import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react'; // Certifique-se de ter o lucide-react instalado (npm install lucide-react)

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Inicializa o tema baseado no localStorage ou na preferência do sistema
  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('plannerduo-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('plannerduo-theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('plannerduo-theme', 'dark');
      setIsDarkMode(true);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Login attempt:', { email, password });
  };

  // Evita flash de conteúdo não estilizado renderizando a UI baseada no tema apenas após a montagem
  if (!mounted) return null;

  return (
    <main className="relative min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 transition-colors duration-500 overflow-hidden">
      
      {/* Botão de Toggle do Tema */}
      <div className="absolute top-6 right-6 z-50 opacity-0 animate-fade-in-up" style={{ animationDelay: '800ms', animationFillMode: 'forwards' }}>
        <button
          onClick={toggleTheme}
          className="p-3 rounded-full bg-white/40 dark:bg-white/10 backdrop-blur-md border border-slate-200 dark:border-white/20 shadow-lg text-slate-800 dark:text-yellow-300 hover:scale-110 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Alternar Tema"
        >
          {isDarkMode ? <Sun size={20} className="animate-spin-slow" /> : <Moon size={20} className="animate-bounce-slight" />}
        </button>
      </div>

      {/* Background animado - Cores adaptadas para Light/Dark */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-blue-300/40 dark:bg-blue-600/30 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-pulse transition-colors duration-500" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-emerald-300/40 dark:bg-emerald-500/20 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-pulse transition-colors duration-500" style={{ animationDelay: '2s' }} />

      {/* Container Principal - Glassmorphism adaptativo */}
      <div className="relative z-10 w-full max-w-md p-8 mx-4 bg-white/60 dark:bg-white/10 backdrop-blur-xl border border-white/50 dark:border-white/20 rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.1)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] animate-fade-in-up transition-colors duration-500">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white tracking-tight opacity-0 animate-fade-in-up transition-colors duration-500" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
            PlannerDuo
          </h1>
          <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm opacity-0 animate-fade-in-up transition-colors duration-500" style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}>
            Acesse seu painel de viagens e finanças.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {/* Input Email */}
          <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 transition-colors duration-500" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-300 ease-in-out hover:bg-white/70 dark:hover:bg-white/10"
              placeholder="seu@email.com"
              required
            />
          </div>

          {/* Input Senha */}
          <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '400ms', animationFillMode: 'forwards' }}>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 transition-colors duration-500" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-300 ease-in-out hover:bg-white/70 dark:hover:bg-white/10"
              placeholder="••••••••"
              required
            />
          </div>

          {/* Botão de Submit */}
          <div className="pt-2 opacity-0 animate-fade-in-up" style={{ animationDelay: '500ms', animationFillMode: 'forwards' }}>
            <button
              type="submit"
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 transform transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-50 dark:focus:ring-offset-slate-900"
            >
              Entrar
            </button>
          </div>
        </form>

        <div className="mt-6 text-center opacity-0 animate-fade-in-up" style={{ animationDelay: '600ms', animationFillMode: 'forwards' }}>
          <a href="#" className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors duration-200">
            Esqueceu sua senha?
          </a>
        </div>
      </div>
    </main>
  );
}
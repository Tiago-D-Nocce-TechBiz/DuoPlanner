'use client';

import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [mounted, setMounted] = useState(false);

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
    console.log('Tentativa de login:', { email, password });
  };

  if (!mounted) return null;

  return (
    <main className="relative min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 transition-colors duration-700 overflow-hidden">
      
      {/* Toggle de Tema */}
      <div className="absolute top-6 right-6 z-50 opacity-0 animate-fade-in-up" style={{ animationDelay: '800ms' }}>
        <button
          onClick={toggleTheme}
          className="p-3 rounded-full bg-white/40 dark:bg-white/5 backdrop-blur-md border border-slate-200 dark:border-white/10 shadow-lg text-slate-700 dark:text-yellow-400 hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Alternar Tema"
        >
          {isDarkMode ? <Sun size={20} className="animate-spin-slow" /> : <Moon size={20} />}
        </button>
      </div>

      {/* Background Animado - Ambient Light */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-blue-400/30 dark:bg-blue-600/20 rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-pulse transition-colors duration-700" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-emerald-400/30 dark:bg-emerald-500/10 rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-pulse transition-colors duration-700" style={{ animationDelay: '2s' }} />

      {/* Container Principal - Glassmorfismo */}
      <div className="relative z-10 w-full max-w-md p-10 mx-4 bg-white/60 dark:bg-slate-900/40 backdrop-blur-2xl border border-white/50 dark:border-white/10 rounded-[2rem] shadow-[0_8px_32px_0_rgba(0,0,0,0.05)] dark:shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] opacity-0 animate-fade-in-up transition-colors duration-700">
        
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-slate-800 dark:text-white tracking-tight opacity-0 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
            PlannerDuo
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-3 text-sm font-medium opacity-0 animate-fade-in-up" style={{ animationDelay: '250ms' }}>
            Acesse seu painel de viagens e finanças.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          {/* Input Email */}
          <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '350ms' }}>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 ml-1 transition-colors duration-500" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-3.5 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-300 hover:bg-white/80 dark:hover:bg-black/40"
              placeholder="seu@email.com"
              required
            />
          </div>

          {/* Input Senha */}
          <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '450ms' }}>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 ml-1 transition-colors duration-500" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-3.5 bg-white/50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-300 hover:bg-white/80 dark:hover:bg-black/40"
              placeholder="••••••••"
              required
            />
          </div>

          {/* Botão de Entrar */}
          <div className="pt-4 opacity-0 animate-fade-in-up" style={{ animationDelay: '550ms' }}>
            <button
              type="submit"
              className="w-full px-5 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl shadow-lg shadow-blue-500/30 transform transition-all duration-300 hover:-translate-y-1 hover:shadow-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-50 dark:focus:ring-offset-slate-950"
            >
              Entrar no Painel
            </button>
          </div>
        </form>

        <div className="mt-8 text-center opacity-0 animate-fade-in-up" style={{ animationDelay: '650ms' }}>
          <a href="#" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors duration-200">
            Esqueceu sua senha?
          </a>
        </div>
      </div>
    </main>
  );
}
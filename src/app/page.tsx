'use client';

import React, { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Lógica de autenticação do sistema
    console.log('Login attempt:', { email });
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center bg-slate-900 overflow-hidden">
      {/* Background animado simulando cores vibrantes para realçar o glassmorfismo */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-blue-600/30 rounded-full blur-[120px] mix-blend-screen animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-emerald-500/20 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDelay: '2s' }} />

      {/* Container Principal - Glassmorphism */}
      <div className="relative z-10 w-full max-w-md p-8 mx-4 bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] animate-fade-in-up">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight opacity-0 animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
            PlannerDuo
          </h1>
          <p className="text-slate-300 mt-2 text-sm opacity-0 animate-fade-in-up" style={{ animationDelay: '200ms', animationFillMode: 'forwards' }}>
            Acesse seu painel de viagens e finanças.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {/* Input Email */}
          <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}>
            <label className="block text-sm font-medium text-slate-300 mb-1" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-300 ease-in-out hover:bg-white/10"
              placeholder="seu@email.com"
              required
            />
          </div>

          {/* Input Senha */}
          <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: '400ms', animationFillMode: 'forwards' }}>
            <label className="block text-sm font-medium text-slate-300 mb-1" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-300 ease-in-out hover:bg-white/10"
              placeholder="••••••••"
              required
            />
          </div>

          {/* Botão de Submit */}
          <div className="pt-2 opacity-0 animate-fade-in-up" style={{ animationDelay: '500ms', animationFillMode: 'forwards' }}>
            <button
              type="submit"
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 transform transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
              Entrar
            </button>
          </div>
        </form>

        <div className="mt-6 text-center opacity-0 animate-fade-in-up" style={{ animationDelay: '600ms', animationFillMode: 'forwards' }}>
          <a href="#" className="text-sm text-blue-400 hover:text-blue-300 transition-colors duration-200">
            Esqueceu sua senha?
          </a>
        </div>
      </div>
    </main>
  );
}
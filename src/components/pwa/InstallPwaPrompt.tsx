"use client";

import { useState, useSyncExternalStore } from "react";
import { X } from "@/components/ui/icons";

/**
 * Convite para instalar o DuoPlanner no celular (só em aparelhos móveis).
 *
 * - Android/Chrome: o evento `beforeinstallprompt` é guardado já no <head>
 *   (layout raiz), antes do React montar; aqui vira o botão
 *   "Instalar Aplicativo no Celular".
 * - iOS/Safari: não existe evento; quando não está instalado
 *   (`navigator.standalone` falso), mostra o passo a passo
 *   Compartilhar → Adicionar à Tela de Início.
 * Dispensar esconde por 30 dias (preferência do APARELHO, `duoplanner-*`:
 * sobrevive ao logout de propósito, não identifica ninguém).
 */

interface EventoInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __pdInstalacao?: EventoInstalacao | null;
  }
}

const CHAVE_DISPENSADO = "duoplanner-pwa-dispensado";
const TRINTA_DIAS = 30 * 24 * 60 * 60 * 1000;

interface Ambiente {
  ios: boolean;
  android: boolean;
  instalado: boolean;
  dispensado: boolean;
}

let ambienteEmCache: Ambiente | null = null;

function lerAmbiente(): Ambiente {
  if (ambienteEmCache) return ambienteEmCache;
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /android/i.test(ua);
  const instalado =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true;
  let dispensado = false;
  try {
    const quando = Number(window.localStorage.getItem(CHAVE_DISPENSADO));
    dispensado = Number.isFinite(quando) && quando > 0 && Date.now() - quando < TRINTA_DIAS;
  } catch {
    // sem storage: mostra normalmente
  }
  ambienteEmCache = { ios, android, instalado, dispensado };
  return ambienteEmCache;
}

const semAssinatura = () => () => {};

function assinarInstalacao(aoMudar: () => void) {
  window.addEventListener("pd:instalacao", aoMudar);
  return () => window.removeEventListener("pd:instalacao", aoMudar);
}

export function InstallPwaPrompt() {
  const ambiente = useSyncExternalStore(semAssinatura, lerAmbiente, () => null);
  const evento = useSyncExternalStore(
    assinarInstalacao,
    () => window.__pdInstalacao ?? null,
    () => null
  );
  const [fechado, setFechado] = useState(false);

  if (!ambiente || ambiente.instalado || ambiente.dispensado || fechado) return null;
  const mostrarAndroid = ambiente.android && evento;
  const mostrarIos = ambiente.ios;
  if (!mostrarAndroid && !mostrarIos) return null;

  function dispensar() {
    try {
      window.localStorage.setItem(CHAVE_DISPENSADO, String(Date.now()));
    } catch {
      // ignora
    }
    setFechado(true);
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice.catch(() => undefined);
    window.__pdInstalacao = null;
    setFechado(true);
  }

  return (
    <aside
      aria-label="Instalar o DuoPlanner"
      className="fixed inset-x-3 z-[65] mx-auto max-w-md glass-panel rounded-2xl p-4 shadow-2xl sm:hidden"
      style={{ bottom: "calc(4rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-heading)]">DuoPlanner no seu celular</p>
          {mostrarAndroid ? (
            <>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                Abra direto da tela inicial, em tela cheia, e consulte roteiro e checklist até sem internet.
              </p>
              <button
                type="button"
                onClick={instalar}
                className="mt-3 w-full rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-xs font-semibold text-[var(--color-accent-foreground)] cursor-pointer"
              >
                Instalar Aplicativo no Celular
              </button>
            </>
          ) : (
            <ol className="mt-1.5 space-y-1.5 text-xs text-[var(--color-muted)]">
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 font-semibold text-[var(--color-heading)]">1</span>
                <span>
                  Toque em <strong className="text-[var(--color-heading)]">Compartilhar</strong>{" "}
                  <IconeCompartilharIos /> na barra do navegador
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 font-semibold text-[var(--color-heading)]">2</span>
                <span>
                  Escolha <strong className="text-[var(--color-heading)]">Adicionar à Tela de Início</strong>
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 font-semibold text-[var(--color-heading)]">3</span>
                <span>Confirme em <strong className="text-[var(--color-heading)]">Adicionar</strong></span>
              </li>
            </ol>
          )}
        </div>
        <button
          type="button"
          onClick={dispensar}
          aria-label="Agora não"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </aside>
  );
}

/** Ícone "Compartilhar" do iOS (quadrado com seta para cima), desenho próprio. */
function IconeCompartilharIos() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="inline h-4 w-4 -mt-0.5 text-[var(--color-heading)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

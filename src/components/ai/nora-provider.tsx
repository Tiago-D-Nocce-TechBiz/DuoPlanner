"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { NoraResposta } from "@/lib/ai/nora-brain";

/** Papel de cada mensagem na conversa com a Nora. */
export type NoraPapel = "user" | "nora";

export interface NoraMensagem {
  id: string;
  papel: NoraPapel;
  texto: string;
  resposta?: NoraResposta; // presente nas mensagens da Nora (carrega as ações)
}

interface NoraContextValue {
  aberta: boolean;
  expandida: boolean;
  mensagens: NoraMensagem[];
  abrir: () => void;
  fechar: () => void;
  alternarExpandir: () => void;
  novaConversa: () => void;
  setMensagens: React.Dispatch<React.SetStateAction<NoraMensagem[]>>;
}

const NoraContext = createContext<NoraContextValue | null>(null);

export function NoraProvider({ children }: { children: React.ReactNode }) {
  const [aberta, setAberta] = useState(false);
  const [expandida, setExpandida] = useState(false);
  const [mensagens, setMensagens] = useState<NoraMensagem[]>([]);

  const valor = useMemo<NoraContextValue>(
    () => ({
      aberta,
      expandida,
      mensagens,
      abrir: () => setAberta(true),
      fechar: () => setAberta(false),
      alternarExpandir: () => setExpandida((e) => !e),
      novaConversa: () => setMensagens([]),
      setMensagens,
    }),
    [aberta, expandida, mensagens]
  );

  return <NoraContext.Provider value={valor}>{children}</NoraContext.Provider>;
}

export function useNora(): NoraContextValue {
  const ctx = useContext(NoraContext);
  if (!ctx) throw new Error("useNora deve ser usado dentro de <NoraProvider>.");
  return ctx;
}

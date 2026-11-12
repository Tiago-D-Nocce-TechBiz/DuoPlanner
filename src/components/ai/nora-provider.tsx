"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { NoraResposta } from "@/lib/ai/nora-brain";
import { obterSupabase } from "@/lib/supabase/client-sob-demanda";
import { getContexto } from "@/lib/sync/motor";

/** Extrai o primeiro nome de um nome completo ou e-mail. */
function primeiroNome(bruto?: string | null): string | null {
  if (!bruto) return null;
  const limpo = bruto.includes("@") ? bruto.split("@")[0] : bruto;
  const primeiro = limpo.trim().split(/[\s._-]+/)[0];
  if (!primeiro) return null;
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

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
  /** Primeiro nome do usuário logado (Supabase), com fallbacks. */
  nomeUsuario: string;
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
  const [nomeUsuario, setNomeUsuario] = useState("viajante");
  const buscou = useRef(false);

  // Identifica automaticamente o primeiro nome do usuário logado:
  // 1) nome do cadastro no Supabase (user_metadata.nome);
  // 2) parte local do e-mail logado;
  // 3) nome do perfil sincronizado (Configurações);
  // Busca uma única vez, de forma assíncrona (sem setState síncrono no efeito).
  useEffect(() => {
    if (buscou.current) return;
    buscou.current = true;

    const doLocal = () => primeiroNome(getContexto()?.perfil?.nome);

    const aplicar = (n: string | null | undefined) => {
      if (n) setNomeUsuario(n);
    };

    // O cliente Supabase chega sob demanda (fora do carregamento inicial);
    // a resposta é sempre assíncrona, então não há setState síncrono no efeito.
    obterSupabase()
      .then(async (supabase) => {
        if (!supabase) return aplicar(doLocal());
        const { data } = await supabase.auth.getUser();
        const meta = (data.user?.user_metadata ?? {}) as { nome?: string; name?: string; full_name?: string };
        aplicar(
          primeiroNome(meta.nome || meta.name || meta.full_name) ||
            primeiroNome(data.user?.email) ||
            doLocal()
        );
      })
      .catch(() => aplicar(doLocal()));
  }, []);

  const valor = useMemo<NoraContextValue>(
    () => ({
      aberta,
      expandida,
      mensagens,
      nomeUsuario,
      abrir: () => setAberta(true),
      fechar: () => setAberta(false),
      alternarExpandir: () => setExpandida((e) => !e),
      novaConversa: () => setMensagens([]),
      setMensagens,
    }),
    [aberta, expandida, mensagens, nomeUsuario]
  );

  return <NoraContext.Provider value={valor}>{children}</NoraContext.Provider>;
}

export function useNora(): NoraContextValue {
  const ctx = useContext(NoraContext);
  if (!ctx) throw new Error("useNora deve ser usado dentro de <NoraProvider>.");
  return ctx;
}

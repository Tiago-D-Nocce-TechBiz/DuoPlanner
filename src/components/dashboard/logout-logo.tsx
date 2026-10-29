"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";
import { getSupabase } from "@/lib/supabase/client";

/**
 * Logo da Sidebar que, ao ser clicada, abre um modal de confirmação de saída.
 * Confirmando, encerra a sessão (Supabase, se configurado) e volta à Landing.
 */
export function LogoutLogo() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleExit() {
    const supabase = getSupabase();
    try {
      await supabase?.auth.signOut();
    } catch {
      // Ignora falha de signOut (ex.: sem sessão); segue para a Landing.
    }
    setOpen(false);
    router.push("/");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Sair da sessão"
      >
        <LogoMark />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Sair da sessão?"
      >
        <p className="text-sm text-foreground">
          Deseja realmente sair da sua sessão e voltar para a página inicial
          (Landing Page)?
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Continuar no painel
          </Button>
          <Button variant="primary" onClick={handleExit}>
            Sim, sair e ir para o início
          </Button>
        </div>
      </Modal>
    </>
  );
}

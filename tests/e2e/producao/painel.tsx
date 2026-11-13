import { createRoot } from "react-dom/client";
import ChecklistPage from "@/app/dashboard/checklist/page";
import RoteiroPage from "@/app/dashboard/roteiro/page";
import { ListaGastos } from "@/components/finance/lista-gastos";
import type { ContextoSincronizacao } from "@/lib/sync/contexto";
import { iniciarSincronizacao } from "@/lib/sync/motor";

/**
 * Telas do painel com o React de produção e o motor de sincronização REAL
 * em modo local (a cópia do aparelho, sem servidor), para cronometrar as
 * interações (ver `painel-producao.spec.ts`). `?tela=` escolhe a tela.
 */
const contexto = (window as unknown as { __contexto: ContextoSincronizacao }).__contexto;
iniciarSincronizacao(contexto, { enviar: () => new Promise(() => {}) });

const TELAS = { financas: ListaGastos, checklist: ChecklistPage, roteiro: RoteiroPage };
const tela = new URLSearchParams(location.search).get("tela");
const Tela = TELAS[tela as keyof typeof TELAS] ?? ListaGastos;
createRoot(document.getElementById("raiz")!).render(<Tela />);

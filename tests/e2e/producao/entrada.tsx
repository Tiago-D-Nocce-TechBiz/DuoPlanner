import { createRoot } from "react-dom/client";
import { SmartInvoiceImporter } from "@/components/finance/smart-invoice-importer";

/** Só o importador, com o React de produção (ver `importador-producao.spec.ts`). */
createRoot(document.getElementById("raiz")!).render(<SmartInvoiceImporter />);

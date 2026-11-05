/**
 * Categorias detalhadas do DuoFinance (importação de fatura).
 *
 * Ficam num módulo próprio, sem o dicionário de estabelecimentos, porque o
 * modelo sincronizado (`@/lib/sync/modelos`) e os esquemas do servidor também
 * as usam: importar `invoice-analyzer` ali levaria o dicionário inteiro para
 * o pacote comum do painel. `invoice-analyzer` reexporta tudo daqui.
 */

export const CATEGORIAS_DUOFINANCE = [
  "Alimentação",
  "Transporte",
  "Hospedagem",
  "Passagens",
  "Compras",
  "Lazer & Passeios",
  "Assinaturas",
  "Saúde & Farmácia",
  "Taxas & Impostos",
  "Outros",
] as const;

export type CategoriaDuoFinance = (typeof CATEGORIAS_DUOFINANCE)[number];

/**
 * Nome de ícone (componente em `src/components/ui/icons.tsx`) para cada
 * categoria. Mantido como string para trafegar entre servidor e cliente e ser
 * validável por zod na resposta da IA.
 */
export const ICONE_POR_CATEGORIA: Record<CategoriaDuoFinance, string> = {
  Alimentação: "Utensils",
  Transporte: "Car",
  Hospedagem: "BedDouble",
  Passagens: "Plane",
  Compras: "ShoppingBag",
  "Lazer & Passeios": "Ticket",
  Assinaturas: "Repeat",
  "Saúde & Farmácia": "Pill",
  "Taxas & Impostos": "Landmark",
  Outros: "Coins",
};

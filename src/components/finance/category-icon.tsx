"use client";

import {
  Utensils,
  Car,
  BedDouble,
  Plane,
  ShoppingBag,
  Ticket,
  Repeat,
  Pill,
  Landmark,
  Coins,
  type AppIcon,
} from "@/components/ui/icons";
import type { CategoriaDuoFinance } from "@/lib/finance/invoice-analyzer";

/**
 * Resolve o nome de ícone (string vinda do motor/IA) para o componente de
 * ícone do DuoPlanner. Mantém a regra do projeto: ícones SVG próprios,
 * monocromáticos, sem emoji e sem biblioteca de terceiros.
 */
const MAPA: Record<string, AppIcon> = {
  Utensils,
  Car,
  BedDouble,
  Plane,
  ShoppingBag,
  Ticket,
  Repeat,
  Pill,
  Landmark,
  Coins,
};

/** Cor de acento por categoria (var CSS inline) para as barras e selos. */
export const COR_CATEGORIA: Record<CategoriaDuoFinance, string> = {
  Alimentação: "#e8833a",
  Transporte: "#3b82f6",
  Hospedagem: "#8b5cf6",
  Passagens: "#0ea5e9",
  Compras: "#ec4899",
  "Lazer & Passeios": "#f59e0b",
  Assinaturas: "#14b8a6",
  "Saúde & Farmácia": "#22c55e",
  "Taxas & Impostos": "#ef4444",
  Outros: "#94a3b8",
};

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Componente = MAPA[name] ?? Coins;
  return <Componente className={className} />;
}

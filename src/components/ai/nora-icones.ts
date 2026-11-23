import {
  Calendar,
  CheckCircle2,
  Hotel,
  Layers,
  MapPin,
  PlaneTakeoff,
  ReceiptText,
  ShieldCheck,
  TrendingDown,
  Wallet,
  type AppIcon,
} from "@/components/ui/icons";
import type { NomeIcone } from "@/lib/ai/nora-strategies";

/** `iconName` do catálogo → componente de ícone do projeto (SVG próprio, sem emoji). */
export const ICONES_DA_NORA: Record<NomeIcone, AppIcon> = {
  Calendar,
  PlaneTakeoff,
  Layers,
  ShieldCheck,
  ReceiptText,
  MapPin,
  Hotel,
  TrendingDown,
  CheckCircle2,
  Wallet,
};

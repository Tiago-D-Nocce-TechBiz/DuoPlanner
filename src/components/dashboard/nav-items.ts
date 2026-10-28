import {
  LayoutDashboard,
  Plane,
  Hotel,
  Map,
  Wallet,
  Settings,
  type LucideIcon,
} from "lucide-react";

/** Itens do menu principal da área autenticada. Fonte única para Sidebar e mobile. */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
  { href: "/dashboard/buscar-viagem", label: "Buscar Viagem", icon: Plane },
  { href: "/dashboard/buscar-hospedagem", label: "Buscar Hospedagem", icon: Hotel },
  { href: "/dashboard/roteiro", label: "Roteiro", icon: Map },
  { href: "/dashboard/financas", label: "Finanças Duo", icon: Wallet },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings },
];

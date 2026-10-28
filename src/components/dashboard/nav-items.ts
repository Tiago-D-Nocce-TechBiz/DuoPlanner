import {
  LayoutDashboard,
  Search,
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
  { href: "/dashboard/busca", label: "Motor de busca", icon: Search },
  { href: "/dashboard/roteiro", label: "Roteiro", icon: Map },
  { href: "/dashboard/financas", label: "Finanças Duo", icon: Wallet },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings },
];

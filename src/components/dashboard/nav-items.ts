import {
  LayoutDashboard,
  Plane,
  Hotel,
  Map,
  Luggage,
  FileText,
  Bell,
  Wallet,
  Handshake,
  Coins,
  Settings,
  type AppIcon,
} from "@/components/ui/icons";

/** Item de navegação. */
export interface NavItem {
  href: string;
  label: string;
  icon: AppIcon;
}

/** Grupo de navegação (seção do menu lateral). */
export interface NavGroup {
  secao: string;
  itens: NavItem[];
}

/** Fonte única do menu, agrupada por seção. */
export const NAV_GROUPS: NavGroup[] = [
  {
    secao: "Planejar",
    itens: [
      { href: "/dashboard", label: "Visão geral", icon: LayoutDashboard },
      { href: "/dashboard/buscar-viagem", label: "Buscar Passagens", icon: Plane },
      { href: "/dashboard/buscar-hospedagem", label: "Buscar Hospedagem", icon: Hotel },
      { href: "/dashboard/roteiro", label: "Roteiro", icon: Map },
      { href: "/dashboard/checklist", label: "Checklist", icon: Luggage },
      { href: "/dashboard/documentos", label: "Documentos", icon: FileText },
      { href: "/dashboard/alertas", label: "Alertas de Preço", icon: Bell },
    ],
  },
  {
    secao: "Finanças",
    itens: [
      { href: "/dashboard/financas", label: "Finanças Duo", icon: Wallet },
      { href: "/dashboard/acerto", label: "Acerto de Contas", icon: Handshake },
      { href: "/dashboard/conversor", label: "Conversor de Moedas", icon: Coins },
    ],
  },
  {
    secao: "Conta",
    itens: [{ href: "/dashboard/configuracoes", label: "Configurações", icon: Settings }],
  },
];

/** Lista achatada (compatibilidade com usos que esperam itens simples). */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.itens);

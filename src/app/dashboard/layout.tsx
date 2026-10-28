import { DashboardShell } from "@/components/dashboard/shell";

export const metadata = { title: "Dashboard — PlannerDuo" };

/**
 * Layout da área autenticada. Envolve todas as páginas /dashboard/* no shell
 * com Sidebar fixa à esquerda (colapsável em mobile) e Header.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}

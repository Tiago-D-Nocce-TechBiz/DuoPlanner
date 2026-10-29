/**
 * As páginas de autenticação trazem o próprio enquadramento completo
 * (cabeçalho, cartão glass e rodapé), então este layout é apenas um
 * passthrough para manter a organização do grupo de rotas (auth).
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

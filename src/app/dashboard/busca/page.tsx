import { redirect } from "next/navigation";

/**
 * Rota legada do motor único de busca. Agora dividida em "Buscar Viagem" e
 * "Buscar Hospedagem" — redirecionamos para a nova rota de voos.
 */
export default function BuscaLegacyPage() {
  redirect("/dashboard/buscar-viagem");
}

import { PageHeading } from "@/components/dashboard/page-heading";
import { FlightSearch } from "@/components/search/flight-search";

export const metadata = { title: "Buscar Viagem — PlannerDuo" };

/** Motor de busca de passagens (Kiwi.com Tequila + memória da IA). */
export default function BuscarViagemPage() {
  return (
    <div>
      <PageHeading
        title="Buscar Viagem"
        description="Passagens reais da Kiwi.com com datas flexíveis e combinações de companhias low-cost. A memória da dupla preenche limites de escala e orçamento."
      />
      <FlightSearch />
    </div>
  );
}

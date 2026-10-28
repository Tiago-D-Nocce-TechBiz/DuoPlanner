import { PageHeading } from "@/components/dashboard/page-heading";
import { FlightSearch } from "@/components/search/flight-search";

export const metadata = { title: "Buscar Viagem — PlannerDuo" };

/** Motor de busca de voos (Deep Linking Outbound + Supabase). */
export default function BuscarViagemPage() {
  return (
    <div>
      <PageHeading
        title="Buscar Viagem"
        description="Informe origem, destino e datas. Geramos links prontos para LATAM, Azul, GOL, Google Flights e Skyscanner — abrem direto na página de resultados."
      />
      <FlightSearch />
    </div>
  );
}

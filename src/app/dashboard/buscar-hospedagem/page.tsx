import { PageHeading } from "@/components/dashboard/page-heading";
import { StaySearch } from "@/components/search/stay-search";

export const metadata = { title: "Buscar Hospedagem — PlannerDuo" };

/** Motor de busca de hospedagens (Deep Linking Outbound + Supabase). */
export default function BuscarHospedagemPage() {
  return (
    <div>
      <PageHeading
        title="Buscar Hospedagem"
        description="Informe destino e datas. Geramos links prontos para Airbnb, Booking.com, Hoteis.com e Trivago — abrem direto na página de resultados."
      />
      <StaySearch />
    </div>
  );
}

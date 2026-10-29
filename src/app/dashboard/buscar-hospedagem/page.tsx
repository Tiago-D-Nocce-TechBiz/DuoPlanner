import { PageHeading } from "@/components/dashboard/page-heading";
import { StaySearch } from "@/components/search/stay-search";

export const metadata = { title: "Buscar Hospedagem — PlannerDuo" };

/** Motor de busca de hospedagens (Booking.com via RapidAPI + memória da IA). */
export default function BuscarHospedagemPage() {
  return (
    <div>
      <PageHeading
        title="Buscar Hospedagem"
        description="Hospedagens da Booking.com com o preço total para a dupla, ordenadas pelo melhor custo-benefício entre nota e preço."
      />
      <StaySearch />
    </div>
  );
}

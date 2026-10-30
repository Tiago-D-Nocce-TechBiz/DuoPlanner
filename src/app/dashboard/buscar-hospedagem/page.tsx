import { PageHeading } from "@/components/dashboard/page-heading";
import { StaySearch } from "@/components/search/stay-search";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const metadata = { title: "Buscar Hospedagem — DuoPlanner" };

/** Motor de busca de hospedagens (Booking.com via RapidAPI + memória da IA). */
export default function BuscarHospedagemPage() {
  return (
    <div>
      <PageHeading
        title="Buscar Hospedagem"
        description="Compare hospedagens no Airbnb, Booking.com, Hoteis.com, Trivago, Decolar e mais — já com suas datas e número de hóspedes."
      />
      <ErrorBoundary
        titulo="A busca de hospedagem não carregou"
        descricao="Tente novamente ou use os links diretos dos parceiros."
      >
        <StaySearch />
      </ErrorBoundary>
    </div>
  );
}

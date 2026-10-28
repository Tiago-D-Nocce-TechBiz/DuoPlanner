import { PageHeading } from "@/components/dashboard/page-heading";
import { SearchEngine } from "@/components/search/search-engine";

export const metadata = { title: "Motor de busca — PlannerDuo" };

/**
 * Página do Motor de Busca (Deep Linking Outbound).
 * A lógica interativa vive em <SearchEngine /> (client component).
 */
export default function BuscaPage() {
  return (
    <div>
      <PageHeading
        title="Motor de busca"
        description="Informe origem, destino e datas. Geramos links prontos para Airbnb, Booking, LATAM, Azul e GOL — abrem direto na página de resultados."
      />
      <SearchEngine />
    </div>
  );
}

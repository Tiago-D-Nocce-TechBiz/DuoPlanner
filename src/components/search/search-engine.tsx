"use client";

/**
 * [LEGADO] O motor de busca único foi dividido em dois:
 *   - <FlightSearch /> em "./flight-search"  (Buscar Viagem)
 *   - <StaySearch />   em "./stay-search"     (Buscar Hospedagem)
 *
 * Este arquivo é mantido apenas como ponte de compatibilidade para qualquer
 * import remanescente de `SearchEngine`, reexportando o motor de voos.
 */
export { FlightSearch as SearchEngine } from "./flight-search";

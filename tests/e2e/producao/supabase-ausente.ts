import type * as SobDemanda from "@/lib/supabase/client-sob-demanda";

/** Sem Supabase no pacote de medição: o motor fica na cópia do aparelho (modo local). */
export const obterSupabase: typeof SobDemanda.obterSupabase = () => Promise.resolve(null);

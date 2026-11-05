-- =====================================================================
-- DuoFinance — metadados ricos da importação de fatura de cartão
-- =====================================================================
-- Execute no SQL Editor do Supabase (fluxo manual do projeto; não há CLI de
-- migrations). Idempotente: pode rodar mais de uma vez sem erro. As mesmas
-- colunas já estão em 20261030000000_esquema_base.sql; este arquivo existe
-- para quem só quer aplicar a evolução do DuoFinance sem reprocessar o esquema.
--
-- Pré-requisito: a tabela public.despesas já deve existir (criada pelo esquema
-- base). Só adiciona o que faltar.
--
-- Tabela LEGADA: a partir de 20261104120100_sincronizacao_casal.sql o
-- importador grava em despesas_viagem (com parcelas e categoria detalhada), e
-- aquela migration copia para lá o que a versão anterior gravou aqui.

alter table public.despesas add column if not exists descricao_original    text;
alter table public.despesas add column if not exists estabelecimento_limpo text;
alter table public.despesas add column if not exists o_que_foi_gasto       text;
alter table public.despesas add column if not exists categoria             text;
alter table public.despesas add column if not exists eh_parcelado          boolean not null default false;
alter table public.despesas add column if not exists parcela_atual         integer;
alter table public.despesas add column if not exists total_parcelas        integer;
alter table public.despesas add column if not exists valor_total_compra    numeric(12, 2);
alter table public.despesas add column if not exists fatura_referencia     text;

-- 'fatura' passa a ser uma origem válida (além de 'manual' e 'ocr').
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'despesas_origem_check') then
    alter table public.despesas drop constraint despesas_origem_check;
  end if;
  alter table public.despesas
    add constraint despesas_origem_check check (origem in ('manual', 'ocr', 'fatura'));

  -- Consistência das parcelas: parcela_atual <= total_parcelas quando houver.
  if not exists (select 1 from pg_constraint where conname = 'despesas_parcela_check') then
    alter table public.despesas add constraint despesas_parcela_check
      check (
        total_parcelas is null
        or parcela_atual is null
        or (parcela_atual >= 1 and total_parcelas >= 1 and parcela_atual <= total_parcelas)
      );
  end if;
end $$;

-- Consulta por mês de referência da fatura (relatórios do ano inteiro).
create index if not exists despesas_fatura_ref_idx
  on public.despesas (user_id, fatura_referencia);

-- =====================================================================
-- Alertas de Preço — histórico de preços por alerta
-- =====================================================================
-- Execute no SQL Editor do Supabase DEPOIS de
-- 20261104120100_sincronizacao_casal.sql. Idempotente: pode rodar mais de uma
-- vez sem erro.
--
-- O monitor diário (/api/cron/price-alerts) já guardava só o ÚLTIMO preço no
-- alerta. Esta tabela guarda um preço por alerta e por dia (fuso de São
-- Paulo), para o casal ver a tendência, o menor preço já visto e a variação
-- desde a primeira verificação.
--
-- Quem escreve: só o monitor, com a chave de serviço (que ignora a RLS).
-- Navegadores (anon e authenticated) apenas LEEM, e só o que é do espaço
-- deles. Rodar o monitor mais de uma vez no mesmo dia atualiza a linha do dia
-- (índice único), nunca cria outra. Apagar o alerta apaga o histórico.
--
-- Deploy: aplique ANTES de publicar o app. Sem a tabela, o monitor segue
-- funcionando (só não grava histórico) e a tela mostra "histórico indisponível".
create table if not exists public.alertas_preco_historico (
  id            uuid primary key default gen_random_uuid(),
  alerta_id     uuid not null references public.alertas_preco (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  dia           date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  preco         numeric(12, 2) not null,
  verificado_em timestamptz not null default now()
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'alertas_preco_historico_preco_check') then
    alter table public.alertas_preco_historico add constraint alertas_preco_historico_preco_check check (
      preco > 0 and preco <= 10000000
    );
  end if;
end $$;
create unique index if not exists alertas_preco_historico_dia_uidx
  on public.alertas_preco_historico (alerta_id, dia);
create index if not exists alertas_preco_historico_ws_idx
  on public.alertas_preco_historico (workspace_id);
alter table public.alertas_preco_historico enable row level security;
drop policy if exists "alertas_historico_select" on public.alertas_preco_historico;
create policy "alertas_historico_select" on public.alertas_preco_historico for select to authenticated
  using (workspace_id in (select public.meus_workspaces()));
-- Sem políticas de insert/update/delete: nenhum navegador grava aqui.
revoke all on table public.alertas_preco_historico from anon;
revoke insert, update, delete, truncate, references, trigger on table public.alertas_preco_historico from authenticated;

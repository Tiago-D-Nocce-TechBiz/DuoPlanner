-- =====================================================================
-- Roteiro — planilha importada, curadoria da Nora e categorias
-- =====================================================================
-- Execute no SQL Editor do Supabase DEPOIS de
-- 20261104120100_sincronizacao_casal.sql. Idempotente: pode rodar mais de uma
-- vez sem erro.
--
-- O que muda:
--   roteiro_dias   + destino            (ex.: "Lisboa"; um dia pode ter destino próprio)
--   roteiro_itens  + turno              (manha | tarde | noite; alternativa ao horário exato)
--                  + categoria          (Praia, Passeio, Gastronomia, Transporte...)
--                  + custo_estimado     (em reais; estimativa, não é gasto lançado)
--                  + origem             (manual | planilha | nora_sugestao)
--                  + fingerprint        (impressão digital da linha importada)
--
-- Reimportar a mesma planilha não duplica: a tela já reconhece as linhas que
-- estão no roteiro, e o índice único é a barreira definitiva (duas abas ou
-- dois aparelhos importando ao mesmo tempo: a segunda gravação é recusada com
-- 23505 e o app a descarta). A unicidade é por ESPAÇO (workspace_id): o
-- roteiro é do casal.
--
-- Deploy: aplique ANTES de publicar o app que lê as colunas. Sem elas, o app
-- detecta a coluna ausente e fica em "modo local" (nada se perde: a fila
-- espera no aparelho até a migration ser aplicada).
alter table public.roteiro_dias add column if not exists destino text;
alter table public.roteiro_itens add column if not exists turno text;
alter table public.roteiro_itens add column if not exists categoria text;
alter table public.roteiro_itens add column if not exists custo_estimado numeric(12, 2);
alter table public.roteiro_itens add column if not exists origem text not null default 'manual';
alter table public.roteiro_itens add column if not exists fingerprint text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roteiro_dias_destino_check') then
    alter table public.roteiro_dias add constraint roteiro_dias_destino_check check (
      destino is null or char_length(destino) <= 80
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'roteiro_itens_planilha_check') then
    alter table public.roteiro_itens add constraint roteiro_itens_planilha_check check (
      (turno is null or turno in ('manha', 'tarde', 'noite'))
      and (categoria is null or char_length(categoria) <= 40)
      and (custo_estimado is null or (custo_estimado >= 0 and custo_estimado <= 1000000))
      and origem in ('manual', 'planilha', 'nora_sugestao')
      and (fingerprint is null or (fingerprint ~ '^r1:[0-9a-f]{64}$' and origem <> 'manual'))
    );
  end if;
end $$;
create unique index if not exists roteiro_itens_fingerprint_uidx
  on public.roteiro_itens (workspace_id, fingerprint)
  where fingerprint is not null;
-- Imutáveis depois de gravados: a impressão digital identifica a linha como
-- veio da planilha (corrigir o título depois não pode fazer a reimportação
-- duplicá-la) e a origem diz de onde a atividade veio.
--
-- Mescla de espaços (aceitar um convite leva o que a pessoa planejou sozinha
-- para o espaço do casal): se a mesma linha importada já está no roteiro do
-- casal, a cópia que viria junto é descartada em vez de estourar o índice
-- único e impedir o aceite do convite. Fica aqui, e não numa nova versão de
-- mesclar_espacos_individuais, para rodar de novo a migration de sincronização
-- não desfazer esta regra.
create or replace function public.roteiro_item_origem_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.mesclando_espacos()
     and new.workspace_id is distinct from old.workspace_id
     and old.fingerprint is not null
     and exists (
       select 1 from public.roteiro_itens x
        where x.workspace_id = new.workspace_id and x.fingerprint = old.fingerprint and x.id <> old.id
     ) then
    delete from public.roteiro_itens where id = old.id;
    return null;
  end if;
  new.fingerprint := old.fingerprint;
  new.origem := old.origem;
  return new;
end $$;
drop trigger if exists trg_roteiro_itens_origem on public.roteiro_itens;
create trigger trg_roteiro_itens_origem
  before update on public.roteiro_itens
  for each row execute function public.roteiro_item_origem_imutavel();

-- =====================================================================
-- Índices de desempenho: as consultas reais do app, da RLS e das tarefas
-- agendadas (levantamento em src/: filtros e ordenações de cada tabela).
-- =====================================================================
-- Execute no SQL Editor DEPOIS de 20261105120000_fingerprint_fatura.sql.
-- Idempotente e só ADITIVA: cria índices, não apaga nenhum, não mexe em
-- dados. O app funciona igual antes e depois; as consultas só ficam mais
-- baratas. (Sem CONCURRENTLY: o SQL Editor roda o script numa transação, e
-- nas tabelas deste app o bloqueio de escrita durante a criação é de
-- milissegundos.)
--
-- Índices que ficam redundantes com estes (ex.: despesas_viagem_ws_data_idx,
-- prefixo do novo de espaço + escopo + data; convites_codigo_idx, duplicado
-- da restrição única) só devem sair numa migration de limpeza, DEPOIS de
-- conferir em produção que ninguém os usa:
--   select indexrelname, idx_scan from pg_stat_user_indexes where schemaname = 'public' order by idx_scan;

-- ---------------------------------------------------------------------------
-- 1) despesas_viagem
-- ---------------------------------------------------------------------------
-- Espaço + escopo + data: a RLS do par ("compartilhado e do meu espaço"),
-- o resumo semanal (compartilhados de vários espaços) e a leitura do painel
-- (workspace_id = ... é prefixo).
create index if not exists despesas_viagem_ws_escopo_data_idx
  on public.despesas_viagem (workspace_id, escopo, data desc);

-- Pessoa + escopo + data: os privados de cada pessoa num período (resumo
-- semanal) e "os meus privados" na leitura do painel.
create index if not exists despesas_viagem_user_escopo_data_idx
  on public.despesas_viagem (user_id, escopo, data desc);

-- ---------------------------------------------------------------------------
-- 2) workspace_members
-- ---------------------------------------------------------------------------
-- "Meus espaços, do mais recente" (getWorkspaceAtual, a cada action) e
-- meus_workspaces(), chamada por toda política de RLS. Com workspace_id e
-- papel no próprio índice, as duas leem só o índice, sem ir à tabela.
create index if not exists workspace_members_user_recentes_idx
  on public.workspace_members (user_id, created_at desc) include (workspace_id, papel);

-- ---------------------------------------------------------------------------
-- 3) alertas_preco: fila do monitor diário
-- ---------------------------------------------------------------------------
-- ativo = true, ida >= hoje, "verificado há mais tempo primeiro" (nulos
-- antes). O índice (ativo, ida, ultima_verificacao_em) não servia a
-- ordenação: ida é faixa e o padrão é NULLS LAST, então o banco ordenava
-- todos os ativos para pegar 60. Parcial: só os ativos entram.
create index if not exists alertas_preco_fila_idx
  on public.alertas_preco (ultima_verificacao_em asc nulls first, ida)
  where ativo;

-- ---------------------------------------------------------------------------
-- 4) perfis: fila do resumo semanal
-- ---------------------------------------------------------------------------
-- email_resumo_semanal = true, os processados há mais tempo primeiro.
-- Antes: varredura da tabela inteira e ordenação a cada execução.
create index if not exists perfis_resumo_fila_idx
  on public.perfis (resumo_semanal_enviado_em asc nulls first)
  where email_resumo_semanal;

-- ---------------------------------------------------------------------------
-- 5) workspaces: dono
-- ---------------------------------------------------------------------------
-- RLS de workspaces (owner_id = auth.uid()) e a mescla dos espaços
-- individuais ao aceitar um convite (filtra por owner_id).
create index if not exists workspaces_owner_idx
  on public.workspaces (owner_id);

-- ---------------------------------------------------------------------------
-- 6) documentos_viagem: o cofre
-- ---------------------------------------------------------------------------
-- Lista do cofre: "os meus" + "os compartilhados do espaço", do mais
-- recentemente atualizado (order by atualizado_em desc limit 200).
create index if not exists documentos_viagem_user_atualizado_idx
  on public.documentos_viagem (user_id, atualizado_em desc);
create index if not exists documentos_viagem_ws_escopo_atualizado_idx
  on public.documentos_viagem (workspace_id, escopo, atualizado_em desc);

-- Conferência (opcional):
-- select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname like any (array[
--   'despesas_viagem_%_escopo_data_idx', 'workspace_members_user_recentes_idx', 'alertas_preco_fila_idx',
--   'perfis_resumo_fila_idx', 'workspaces_owner_idx', 'documentos_viagem_%_atualizado_idx']);

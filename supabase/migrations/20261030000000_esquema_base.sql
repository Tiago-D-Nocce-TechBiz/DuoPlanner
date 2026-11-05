-- DuoPlanner — Migration 20261030000000: esquema base (antigo supabase/schema.sql)
-- ============================================================================
-- JÁ APLICADA em produção. Fica aqui como linha de base: um ambiente novo roda
-- todas as migrations em ordem (esta primeiro). As políticas "fail-open"
-- abaixo (`user_id is null`) são SUBSTITUÍDAS pela migration seguinte
-- (20261104120000_endurecimento_seguranca.sql) — nunca rode esta sozinha em
-- produção.
--
-- Idempotente e à prova de tabelas parcialmente criadas: todas as colunas são
-- garantidas com "add column if not exists" ANTES de índices, funções,
-- policies e triggers que dependem delas. Requer PostgreSQL 15+.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ===========================================================================
-- 1) TABELAS (cria se não existir)
-- ===========================================================================

create table if not exists public.viagens (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.despesas (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.preferencias_duo (
  id          uuid primary key default gen_random_uuid(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.memoria_ia (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.convites (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.roteiro_itens (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now()
);

-- ===========================================================================
-- 2) COLUNAS (garante todas, mesmo em tabelas pré-existentes)
-- ===========================================================================

-- viagens
alter table public.viagens add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.viagens add column if not exists tipo text;
alter table public.viagens add column if not exists origem text;
alter table public.viagens add column if not exists destino text;
alter table public.viagens add column if not exists dados jsonb not null default '{}'::jsonb;
alter table public.viagens add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

-- despesas
alter table public.despesas add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.despesas add column if not exists estabelecimento text;
alter table public.despesas add column if not exists valor numeric(12, 2) not null default 0;
alter table public.despesas add column if not exists moeda text not null default 'BRL';
alter table public.despesas add column if not exists categoria text;
alter table public.despesas add column if not exists data date;
alter table public.despesas add column if not exists titulo text;
alter table public.despesas add column if not exists origem text not null default 'manual';
alter table public.despesas add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.despesas add column if not exists escopo text not null default 'viagem_compartilhado';
alter table public.despesas add column if not exists categoria_destino text;
-- DuoFinance — metadados ricos da importação de fatura de cartão
alter table public.despesas add column if not exists descricao_original text;
alter table public.despesas add column if not exists estabelecimento_limpo text;
alter table public.despesas add column if not exists o_que_foi_gasto text;
alter table public.despesas add column if not exists eh_parcelado boolean not null default false;
alter table public.despesas add column if not exists parcela_atual integer;
alter table public.despesas add column if not exists total_parcelas integer;
alter table public.despesas add column if not exists valor_total_compra numeric(12, 2);
alter table public.despesas add column if not exists fatura_referencia text;

-- preferencias_duo
alter table public.preferencias_duo add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.preferencias_duo add column if not exists chave text;
alter table public.preferencias_duo add column if not exists valor jsonb;
alter table public.preferencias_duo add column if not exists descricao text;
alter table public.preferencias_duo add column if not exists origem text not null default 'ia';

-- memoria_ia
alter table public.memoria_ia add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.memoria_ia add column if not exists tipo text;
alter table public.memoria_ia add column if not exists resumo text;
alter table public.memoria_ia add column if not exists dados jsonb not null default '{}'::jsonb;

-- workspaces
alter table public.workspaces add column if not exists nome text not null default 'Nossa Viagem';
alter table public.workspaces add column if not exists codigo text not null default encode(gen_random_bytes(6), 'hex');
alter table public.workspaces add column if not exists owner_id uuid references auth.users (id) on delete set null;

-- workspace_members
alter table public.workspace_members add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.workspace_members add column if not exists user_id uuid references auth.users (id) on delete cascade;
alter table public.workspace_members add column if not exists papel text not null default 'parceiro';

-- convites
alter table public.convites add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.convites add column if not exists codigo text not null default encode(gen_random_bytes(8), 'hex');
alter table public.convites add column if not exists email_convidado text;
alter table public.convites add column if not exists status text not null default 'pendente';
alter table public.convites add column if not exists convidado_por uuid references auth.users (id) on delete set null;

-- roteiro_itens
alter table public.roteiro_itens add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.roteiro_itens add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.roteiro_itens add column if not exists dia date;
alter table public.roteiro_itens add column if not exists titulo text;
alter table public.roteiro_itens add column if not exists descricao text;
alter table public.roteiro_itens add column if not exists horario text;

-- ===========================================================================
-- 3) CONSTRAINTS (checks e uniques) — adicionadas só se ainda não existirem
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'viagens_tipo_check') then
    alter table public.viagens add constraint viagens_tipo_check check (tipo is null or tipo in ('voo', 'hospedagem'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'despesas_origem_check') then
    alter table public.despesas add constraint despesas_origem_check check (origem in ('manual', 'ocr', 'fatura'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'despesas_escopo_check') then
    alter table public.despesas add constraint despesas_escopo_check check (escopo in ('viagem_compartilhado', 'pessoal_privado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'preferencias_origem_check') then
    alter table public.preferencias_duo add constraint preferencias_origem_check check (origem in ('ia', 'usuario'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'memoria_tipo_check') then
    alter table public.memoria_ia add constraint memoria_tipo_check check (tipo is null or tipo in ('preferencia', 'recibo'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspaces_codigo_key') then
    alter table public.workspaces add constraint workspaces_codigo_key unique (codigo);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspace_members_papel_check') then
    alter table public.workspace_members add constraint workspace_members_papel_check check (papel in ('dono', 'parceiro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workspace_members_unique') then
    alter table public.workspace_members add constraint workspace_members_unique unique (workspace_id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'convites_codigo_key') then
    alter table public.convites add constraint convites_codigo_key unique (codigo);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'convites_status_check') then
    alter table public.convites add constraint convites_status_check check (status in ('pendente', 'aceito', 'revogado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'preferencias_duo_user_chave_key') then
    alter table public.preferencias_duo add constraint preferencias_duo_user_chave_key unique nulls not distinct (user_id, chave);
  end if;
end $$;

-- ===========================================================================
-- 4) ÍNDICES
-- ===========================================================================

create index if not exists viagens_user_idx on public.viagens (user_id);
create index if not exists viagens_tipo_idx on public.viagens (tipo);
create index if not exists viagens_workspace_idx on public.viagens (workspace_id);
create index if not exists despesas_user_idx on public.despesas (user_id);
create index if not exists despesas_user_data_idx on public.despesas (user_id, data desc);
create index if not exists despesas_workspace_idx on public.despesas (workspace_id);
create index if not exists memoria_ia_user_created_idx on public.memoria_ia (user_id, created_at desc);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);
create index if not exists workspace_members_ws_idx on public.workspace_members (workspace_id);
create index if not exists convites_codigo_idx on public.convites (codigo);
create index if not exists convites_ws_idx on public.convites (workspace_id);
create index if not exists roteiro_itens_ws_idx on public.roteiro_itens (workspace_id, dia);

-- ===========================================================================
-- 5) RLS (Row Level Security)
-- ===========================================================================

alter table public.viagens enable row level security;
alter table public.despesas enable row level security;
alter table public.preferencias_duo enable row level security;
alter table public.memoria_ia enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.convites enable row level security;
alter table public.roteiro_itens enable row level security;

-- Função auxiliar: workspaces a que o usuário atual pertence.
create or replace function public.meus_workspaces()
returns setof uuid
language sql
security definer
set search_path = public
as $$
  select workspace_id from public.workspace_members where user_id = auth.uid();
$$;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'viagens' and policyname = 'viagens_owner') then
    create policy "viagens_owner" on public.viagens
      for all using (user_id is null or auth.uid() = user_id)
      with check (user_id is null or auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'preferencias_duo' and policyname = 'preferencias_duo_owner') then
    create policy "preferencias_duo_owner" on public.preferencias_duo
      for all using (user_id is null or auth.uid() = user_id)
      with check (user_id is null or auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'memoria_ia' and policyname = 'memoria_ia_owner') then
    create policy "memoria_ia_owner" on public.memoria_ia
      for all using (user_id is null or auth.uid() = user_id)
      with check (user_id is null or auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'workspaces' and policyname = 'workspaces_membros') then
    create policy "workspaces_membros" on public.workspaces
      for all using (owner_id is null or auth.uid() = owner_id or id in (select public.meus_workspaces()))
      with check (owner_id is null or auth.uid() = owner_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'workspace_members' and policyname = 'workspace_members_self') then
    create policy "workspace_members_self" on public.workspace_members
      for all using (user_id is null or auth.uid() = user_id or workspace_id in (select public.meus_workspaces()))
      with check (user_id is null or auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'convites' and policyname = 'convites_membros') then
    create policy "convites_membros" on public.convites for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'roteiro_itens' and policyname = 'roteiro_itens_ws') then
    create policy "roteiro_itens_ws" on public.roteiro_itens
      for all using (workspace_id is null or workspace_id in (select public.meus_workspaces()))
      with check (workspace_id is null or workspace_id in (select public.meus_workspaces()));
  end if;

  -- Despesas: remove a política antiga da Fase 1 e aplica a de escopo.
  if exists (select 1 from pg_policies where tablename = 'despesas' and policyname = 'despesas_owner') then
    drop policy "despesas_owner" on public.despesas;
  end if;
  if not exists (select 1 from pg_policies where tablename = 'despesas' and policyname = 'despesas_escopo') then
    create policy "despesas_escopo" on public.despesas
      for all using (
        user_id is null
        or auth.uid() = user_id
        or (escopo = 'viagem_compartilhado' and workspace_id in (select public.meus_workspaces()))
      )
      with check (user_id is null or auth.uid() = user_id);
  end if;
end $$;

-- ===========================================================================
-- 6) TRIGGER — registra o dono como membro ao criar um workspace
-- ===========================================================================

create or replace function public.registrar_dono_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is not null then
    insert into public.workspace_members (workspace_id, user_id, papel)
    values (new.id, new.owner_id, 'dono')
    on conflict (workspace_id, user_id) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists trg_registrar_dono on public.workspaces;
create trigger trg_registrar_dono
  after insert on public.workspaces
  for each row execute function public.registrar_dono_workspace();

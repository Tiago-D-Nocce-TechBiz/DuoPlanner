-- PlannerDuo — Esquema base (Supabase / PostgreSQL)
-- Execute no SQL Editor do Supabase.

-- Extensão para UUIDs
create extension if not exists "pgcrypto";

-- Tabela de buscas (viagens/voos e hospedagens).
-- `tipo` distingue 'voo' de 'hospedagem'; `dados` guarda o payload completo.
create table if not exists public.viagens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  tipo        text not null check (tipo in ('voo', 'hospedagem')),
  origem      text,
  destino     text,
  dados       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists viagens_user_idx on public.viagens (user_id);
create index if not exists viagens_tipo_idx on public.viagens (tipo);

-- Tabela de despesas (Finanças Duo) — preparação para o OCR por IA.
create table if not exists public.despesas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users (id) on delete cascade,
  estabelecimento text,
  valor          numeric(12, 2) not null default 0,
  moeda          text not null default 'BRL',
  categoria      text,
  data           date,
  created_at     timestamptz not null default now()
);

create index if not exists despesas_user_idx on public.despesas (user_id);

-- Row Level Security: cada usuário só acessa os próprios registros.
alter table public.viagens enable row level security;
alter table public.despesas enable row level security;

-- Política permissiva para desenvolvimento quando ainda não há auth.
-- Em produção, troque por políticas baseadas em auth.uid() = user_id.
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'viagens' and policyname = 'viagens_owner'
  ) then
    create policy "viagens_owner" on public.viagens
      for all using (user_id is null or auth.uid() = user_id)
      with check (user_id is null or auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'despesas' and policyname = 'despesas_owner'
  ) then
    create policy "despesas_owner" on public.despesas
      for all using (user_id is null or auth.uid() = user_id)
      with check (user_id is null or auth.uid() = user_id);
  end if;
end $$;

-- ===========================================================================
-- Fase 2 — IA (OCR de recibos + memória da dupla)
-- Idempotente: pode rodar o arquivo inteiro de novo no SQL Editor.
-- Requer PostgreSQL 15+ (padrão do Supabase) por causa de NULLS NOT DISTINCT.
-- ===========================================================================

-- Despesas: título extraído pela IA e origem do lançamento.
alter table public.despesas add column if not exists titulo text;
alter table public.despesas
  add column if not exists origem text not null default 'manual'
  check (origem in ('manual', 'ocr'));

create index if not exists despesas_user_data_idx
  on public.despesas (user_id, data desc);

-- Preferências consolidadas que a IA lembra (uma linha por chave).
-- NULLS NOT DISTINCT permite o upsert no "modo dupla única" (user_id nulo)
-- enquanto o login real não estiver ligado.
create table if not exists public.preferencias_duo (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  chave       text not null,
  valor       jsonb not null,
  descricao   text,
  origem      text not null default 'ia' check (origem in ('ia', 'usuario')),
  updated_at  timestamptz not null default now(),
  constraint preferencias_duo_user_chave_key unique nulls not distinct (user_id, chave)
);

-- Histórico do que a dupla contou à IA e do que a IA fez (ex.: recibos lidos).
create table if not exists public.memoria_ia (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  tipo        text not null check (tipo in ('preferencia', 'recibo')),
  resumo      text not null,
  dados       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists memoria_ia_user_created_idx
  on public.memoria_ia (user_id, created_at desc);

alter table public.preferencias_duo enable row level security;
alter table public.memoria_ia enable row level security;

-- Mesmo padrão de desenvolvimento das tabelas da Fase 1: registros sem dono
-- (user_id nulo) ficam acessíveis enquanto não há Auth. Em produção, troque
-- por políticas baseadas apenas em auth.uid() = user_id.
do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'preferencias_duo' and policyname = 'preferencias_duo_owner'
  ) then
    create policy "preferencias_duo_owner" on public.preferencias_duo
      for all using (user_id is null or auth.uid() = user_id)
      with check (user_id is null or auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'memoria_ia' and policyname = 'memoria_ia_owner'
  ) then
    create policy "memoria_ia_owner" on public.memoria_ia
      for all using (user_id is null or auth.uid() = user_id)
      with check (user_id is null or auth.uid() = user_id);
  end if;
end $$;

-- ===========================================================================
-- Fase 3 — Contas compartilhadas (workspaces), convites e escopo de privacidade
-- Idempotente: pode rodar o arquivo inteiro de novo no SQL Editor.
--
-- Modelo: cada usuário pertence a um "workspace" (espaço compartilhado da
-- dupla). Dois usuários no mesmo workspace_id enxergam e editam os mesmos
-- dados compartilhados. Despesas marcadas como 'pessoal_privado' ficam
-- visíveis apenas para quem as lançou.
-- ===========================================================================

-- Espaço compartilhado da dupla.
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null default 'Nossa Viagem',
  codigo      text not null unique default encode(gen_random_bytes(6), 'hex'),
  owner_id    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Vínculo usuário <-> workspace (papel: dono ou parceiro).
create table if not exists public.workspace_members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  papel        text not null default 'parceiro' check (papel in ('dono', 'parceiro')),
  created_at   timestamptz not null default now(),
  constraint workspace_members_unique unique (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id);
create index if not exists workspace_members_ws_idx
  on public.workspace_members (workspace_id);

-- Convites por e-mail/código para entrar num workspace.
create table if not exists public.convites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  codigo        text not null unique default encode(gen_random_bytes(8), 'hex'),
  email_convidado text,
  status        text not null default 'pendente' check (status in ('pendente', 'aceito', 'revogado')),
  convidado_por uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists convites_codigo_idx on public.convites (codigo);
create index if not exists convites_ws_idx on public.convites (workspace_id);

-- Despesas passam a pertencer a um workspace e ter escopo de privacidade.
alter table public.despesas
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
alter table public.despesas
  add column if not exists escopo text not null default 'viagem_compartilhado'
  check (escopo in ('viagem_compartilhado', 'pessoal_privado'));
alter table public.despesas
  add column if not exists categoria_destino text;

create index if not exists despesas_workspace_idx
  on public.despesas (workspace_id);

-- Buscas (viagens) e roteiro também pertencem ao workspace.
alter table public.viagens
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;
create index if not exists viagens_workspace_idx
  on public.viagens (workspace_id);

-- Itens do roteiro compartilhado.
create table if not exists public.roteiro_itens (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid references public.workspaces (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete set null,
  dia           date,
  titulo        text not null,
  descricao     text,
  horario       text,
  created_at    timestamptz not null default now()
);

create index if not exists roteiro_itens_ws_idx
  on public.roteiro_itens (workspace_id, dia);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.convites enable row level security;
alter table public.roteiro_itens enable row level security;

-- Função auxiliar: retorna os workspace_id a que o usuário atual pertence.
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
  -- Workspaces: membros enxergam; registros órfãos liberados em dev.
  if not exists (select 1 from pg_policies where tablename = 'workspaces' and policyname = 'workspaces_membros') then
    create policy "workspaces_membros" on public.workspaces
      for all using (
        owner_id is null
        or auth.uid() = owner_id
        or id in (select public.meus_workspaces())
      )
      with check (owner_id is null or auth.uid() = owner_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'workspace_members' and policyname = 'workspace_members_self') then
    create policy "workspace_members_self" on public.workspace_members
      for all using (user_id is null or auth.uid() = user_id or workspace_id in (select public.meus_workspaces()))
      with check (user_id is null or auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'convites' and policyname = 'convites_membros') then
    create policy "convites_membros" on public.convites
      for all using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where tablename = 'roteiro_itens' and policyname = 'roteiro_itens_ws') then
    create policy "roteiro_itens_ws" on public.roteiro_itens
      for all using (workspace_id is null or workspace_id in (select public.meus_workspaces()))
      with check (workspace_id is null or workspace_id in (select public.meus_workspaces()));
  end if;
end $$;

-- Atualiza a política de despesas para respeitar workspace + escopo privado.
-- Compartilhadas: visíveis a todo o workspace. Privadas: só para o autor.
do $$
begin
  if exists (select 1 from pg_policies where tablename = 'despesas' and policyname = 'despesas_owner') then
    drop policy "despesas_owner" on public.despesas;
  end if;

  if not exists (select 1 from pg_policies where tablename = 'despesas' and policyname = 'despesas_escopo') then
    create policy "despesas_escopo" on public.despesas
      for all using (
        user_id is null
        or auth.uid() = user_id
        or (
          escopo = 'viagem_compartilhado'
          and workspace_id in (select public.meus_workspaces())
        )
      )
      with check (user_id is null or auth.uid() = user_id);
  end if;
end $$;

-- Ao criar um workspace, registra o dono como membro automaticamente.
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

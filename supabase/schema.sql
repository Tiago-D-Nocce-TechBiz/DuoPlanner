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

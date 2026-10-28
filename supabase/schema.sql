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

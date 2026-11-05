-- DuoPlanner — Migration 20261104120100: sincronização do casal
-- ============================================================================
-- Tira Finanças, Acerto, Roteiro, Checklist, Alertas e Documentos do
-- localStorage e leva para o Postgres, por espaço do casal (workspace_id),
-- respeitando o escopo pessoal_privado × viagem_compartilhado.
--
--   perfis              nome, chave Pix e preferências de e-mail (1 por usuário)
--   acordos_divisao     regra do acerto: 50/50, proporcional ou valor fixo
--   despesas_viagem     gastos com pago_por, proporcao_divisao, escopo e moeda
--   roteiro_dias        dias do roteiro (data opcional)
--   roteiro_itens       (já existia) + dia_id, ordem e auditoria
--   checklist_itens     bagagem e preparativos
--   alertas_preco       alvo de preço + estado do monitoramento por e-mail
--   documentos_viagem   número CIFRADO na aplicação (AES-256-GCM) + 4 finais
--
-- Pré-requisito: 20261104120000_endurecimento_seguranca.sql.
-- Idempotente e ADITIVA: o código em produção (4b35f70) não usa estas
-- tabelas, então aplicar antes do deploy não quebra nada.
-- A tabela antiga `despesas` é copiada para `despesas_viagem` e fica para uma
-- migration futura de remoção (expandir antes de contrair).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) PERFIS
-- ---------------------------------------------------------------------------
create table if not exists public.perfis (
  user_id                   uuid primary key references auth.users (id) on delete cascade,
  nome                      text not null default '',
  cidade_base               text,
  iata_base                 text,
  chave_pix                 text,
  tipo_chave_pix            text,
  nome_recebedor_pix        text,
  cidade_pix                text,
  email_alertas             boolean not null default true,
  email_resumo_semanal      boolean not null default true,
  resumo_semanal_enviado_em timestamptz,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfis_campos_check') then
    alter table public.perfis add constraint perfis_campos_check check (
      char_length(nome) <= 80
      and (cidade_base is null or char_length(cidade_base) <= 80)
      and (iata_base is null or iata_base ~ '^[A-Z]{3}$')
      and (chave_pix is null or char_length(chave_pix) between 1 and 77)
      and (tipo_chave_pix is null or tipo_chave_pix in ('cpf', 'cnpj', 'telefone', 'email', 'aleatoria'))
      and ((chave_pix is null) = (tipo_chave_pix is null))
      and (nome_recebedor_pix is null or char_length(nome_recebedor_pix) between 1 and 25)
      and (cidade_pix is null or char_length(cidade_pix) between 1 and 15)
    );
  end if;
end $$;

-- Perfil criado junto com a conta; contas existentes ganham o seu agora.
create or replace function public.criar_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (user_id, nome)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(coalesce(new.email, ''), '@', 1)), 80)
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

revoke all on function public.criar_perfil_usuario() from public, anon, authenticated;

drop trigger if exists trg_criar_perfil_usuario on auth.users;
create trigger trg_criar_perfil_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_usuario();

insert into public.perfis (user_id, nome)
select u.id,
       left(coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), split_part(coalesce(u.email, ''), '@', 1)), 80)
  from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) AUDITORIA GENÉRICA: atualizado_em/por. Campos de identidade (id, dono,
--    espaço, criação) são imutáveis num UPDATE — o cliente pode mandar o
--    registro inteiro sem conseguir "mudar de dono" a linha.
-- ---------------------------------------------------------------------------
-- A mescla de espaços (aceite de convite) é a única operação autorizada a
-- trocar workspace_id: ela liga esta marca só dentro da própria transação.
create or replace function public.mesclando_espacos()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('pd.mesclando', true), '') = 'on';
$$;

create or replace function public.antes_gravar_registro()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_novo jsonb := to_jsonb(new);
  v_velho jsonb;
begin
  if tg_op = 'UPDATE' then
    v_velho := to_jsonb(old);
    -- Identidade: as colunas que existirem voltam ao valor antigo.
    v_novo := v_novo
      || (case when v_velho ? 'id' then jsonb_build_object('id', v_velho -> 'id') else '{}'::jsonb end)
      || (case when v_velho ? 'user_id' then jsonb_build_object('user_id', v_velho -> 'user_id') else '{}'::jsonb end)
      || (case when v_velho ? 'workspace_id' and not public.mesclando_espacos()
               then jsonb_build_object('workspace_id', v_velho -> 'workspace_id') else '{}'::jsonb end)
      || (case when v_velho ? 'criado_em' then jsonb_build_object('criado_em', v_velho -> 'criado_em') else '{}'::jsonb end)
      || (case when v_velho ? 'created_at' then jsonb_build_object('created_at', v_velho -> 'created_at') else '{}'::jsonb end);
  end if;
  v_novo := v_novo || jsonb_build_object('atualizado_em', now());
  if v_uid is not null and v_novo ? 'atualizado_por' then
    v_novo := v_novo || jsonb_build_object('atualizado_por', v_uid);
  end if;
  new := jsonb_populate_record(new, v_novo);
  return new;
end $$;

drop trigger if exists trg_perfis_auditoria on public.perfis;
create trigger trg_perfis_auditoria
  before insert or update on public.perfis
  for each row execute function public.antes_gravar_registro();

-- ---------------------------------------------------------------------------
-- 3) ACORDO DE DIVISÃO (1 por espaço).
--    proporcional: `percentual_dono` = parte do dono do espaço (ex.: 60/40);
--    fixo: `quem_cobre_fixo` cobre `valor_fixo` do total; o outro, o restante.
-- ---------------------------------------------------------------------------
create table if not exists public.acordos_divisao (
  workspace_id    uuid primary key references public.workspaces (id) on delete cascade,
  regra           text not null default 'igual',
  percentual_dono numeric(5, 2) not null default 50,
  valor_fixo      numeric(12, 2),
  quem_cobre_fixo text not null default 'dono',
  atualizado_por  uuid references auth.users (id) on delete set null,
  atualizado_em   timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'acordos_divisao_regra_check') then
    alter table public.acordos_divisao add constraint acordos_divisao_regra_check check (
      regra in ('igual', 'proporcional', 'fixo')
      and percentual_dono between 0 and 100
      and (valor_fixo is null or valor_fixo between 0 and 10000000)
      and quem_cobre_fixo in ('dono', 'parceiro')
      and (regra <> 'fixo' or valor_fixo is not null)
    );
  end if;
end $$;

create or replace function public.antes_gravar_acordo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id;
  end if;
  new.atualizado_em := now();
  if auth.uid() is not null then
    new.atualizado_por := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_acordos_divisao_auditoria on public.acordos_divisao;
create trigger trg_acordos_divisao_auditoria
  before insert or update on public.acordos_divisao
  for each row execute function public.antes_gravar_acordo();

-- ---------------------------------------------------------------------------
-- 4) DESPESAS DA VIAGEM
--    tipo 'acerto' = pagamento do acerto de contas: quem pagou (pago_por)
--    transfere o valor ao outro (proporcao_divisao = 0: nada dele "é dele").
-- ---------------------------------------------------------------------------
create table if not exists public.despesas_viagem (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workspace_id      uuid references public.workspaces (id) on delete set null,
  pago_por          uuid references auth.users (id) on delete set null,
  tipo              text not null default 'gasto',
  descricao         text not null,
  valor             numeric(12, 2) not null,
  moeda             text not null default 'BRL',
  cotacao_brl       numeric(14, 6),
  data              date not null default current_date,
  categoria         text not null default 'Gasto Pessoal (Fora da Viagem)',
  escopo            text not null default 'pessoal_privado',
  proporcao_divisao numeric(5, 2),
  origem            text not null default 'manual',
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid references auth.users (id) on delete set null
);

-- Metadados da fatura importada no DuoFinance (nulos nos demais gastos).
alter table public.despesas_viagem add column if not exists o_que_foi_gasto     text;
alter table public.despesas_viagem add column if not exists categoria_detalhada text;
alter table public.despesas_viagem add column if not exists parcela_atual       integer;
alter table public.despesas_viagem add column if not exists total_parcelas      integer;
alter table public.despesas_viagem add column if not exists fatura_referencia   text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'despesas_viagem_fatura_check') then
    alter table public.despesas_viagem add constraint despesas_viagem_fatura_check check (
      (o_que_foi_gasto is null or char_length(o_que_foi_gasto) <= 120)
      and (categoria_detalhada is null or categoria_detalhada in (
            'Alimentação', 'Transporte', 'Hospedagem', 'Passagens', 'Compras', 'Lazer & Passeios',
            'Assinaturas', 'Saúde & Farmácia', 'Taxas & Impostos', 'Outros'))
      -- "is not null" explícito: numa CHECK, comparação com nulo passa.
      and ((parcela_atual is null and total_parcelas is null)
           or (parcela_atual is not null and total_parcelas is not null
               and total_parcelas between 2 and 72 and parcela_atual between 1 and total_parcelas))
      and (fatura_referencia is null or fatura_referencia ~ '^\d{4}-(0[1-9]|1[0-2])$')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'despesas_viagem_campos_check') then
    alter table public.despesas_viagem add constraint despesas_viagem_campos_check check (
      tipo in ('gasto', 'acerto')
      and char_length(descricao) between 1 and 120
      and valor > 0 and valor <= 1000000
      and moeda ~ '^[A-Z]{3}$'
      and (moeda = 'BRL' or (cotacao_brl is not null and cotacao_brl > 0))
      and categoria in ('Passagens & Transporte', 'Hospedagem', 'Alimentação & Gastronomia',
                        'Passeios & Lazer', 'Gasto Pessoal (Fora da Viagem)')
      and escopo in ('viagem_compartilhado', 'pessoal_privado')
      and (escopo = 'pessoal_privado' or workspace_id is not null)
      and (proporcao_divisao is null or proporcao_divisao between 0 and 100)
      and origem in ('manual', 'importacao', 'recibo', 'nora', 'legado')
      and (tipo = 'gasto' or (escopo = 'viagem_compartilhado' and proporcao_divisao is not distinct from 0))
    );
  end if;
end $$;

create index if not exists despesas_viagem_ws_data_idx on public.despesas_viagem (workspace_id, data desc);
create index if not exists despesas_viagem_user_data_idx on public.despesas_viagem (user_id, data desc);

-- Quem não criou o gasto (o parceiro, num gasto compartilhado) pode corrigir
-- valor, data, quem pagou etc., mas não torná-lo privado nem mudar o tipo.
create or replace function public.antes_gravar_despesa_viagem()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.user_id := old.user_id;
    if not public.mesclando_espacos() then
      new.workspace_id := old.workspace_id;
    end if;
    new.criado_em := old.criado_em;
    if v_uid is distinct from old.user_id then
      new.escopo := old.escopo;
      new.tipo := old.tipo;
    end if;
  end if;
  new.atualizado_em := now();
  if v_uid is not null then
    new.atualizado_por := v_uid;
  end if;
  return new;
end $$;

drop trigger if exists trg_despesas_viagem_auditoria on public.despesas_viagem;
create trigger trg_despesas_viagem_auditoria
  before insert or update on public.despesas_viagem
  for each row execute function public.antes_gravar_despesa_viagem();

-- Cópia da tabela legada: recibos do OCR antigo e faturas importadas pelo
-- DuoFinance antes desta versão (origem 'fatura', com parcelas e categoria
-- detalhada). Moeda estrangeira sem cotação fica de fora (a tabela antiga não
-- guardava a cotação usada). Idempotente: rode de novo logo após o deploy para
-- trazer o que a versão anterior ainda gravou em `despesas` nesse intervalo.
-- As colunas da fatura são garantidas aqui para a cópia não depender da ordem
-- em que o esquema base foi reaplicado.
alter table public.despesas add column if not exists o_que_foi_gasto   text;
alter table public.despesas add column if not exists eh_parcelado      boolean not null default false;
alter table public.despesas add column if not exists parcela_atual     integer;
alter table public.despesas add column if not exists total_parcelas    integer;
alter table public.despesas add column if not exists fatura_referencia text;

insert into public.despesas_viagem
  (id, user_id, workspace_id, pago_por, descricao, valor, moeda, data, categoria, escopo, origem,
   o_que_foi_gasto, categoria_detalhada, parcela_atual, total_parcelas, fatura_referencia, criado_em)
select d.id,
       d.user_id,
       d.workspace_id,
       d.user_id,
       left(coalesce(nullif(trim(d.titulo), ''), nullif(trim(d.estabelecimento), ''), 'Despesa'), 120),
       d.valor,
       'BRL',
       coalesce(d.data, d.created_at::date),
       case when d.categoria_destino in ('Passagens & Transporte', 'Hospedagem', 'Alimentação & Gastronomia',
                                         'Passeios & Lazer', 'Gasto Pessoal (Fora da Viagem)')
              then d.categoria_destino
            -- Categoria detalhada da fatura → categoria da viagem (mesma regra do app).
            when d.categoria = 'Alimentação' then 'Alimentação & Gastronomia'
            when d.categoria in ('Transporte', 'Passagens') then 'Passagens & Transporte'
            when d.categoria = 'Hospedagem' then 'Hospedagem'
            when d.categoria = 'Lazer & Passeios' then 'Passeios & Lazer'
            else 'Gasto Pessoal (Fora da Viagem)' end,
       case when d.escopo = 'viagem_compartilhado' and d.workspace_id is not null
            then 'viagem_compartilhado' else 'pessoal_privado' end,
       case when d.origem = 'ocr' then 'recibo'
            when d.origem = 'fatura' then 'importacao'
            else 'legado' end,
       case when d.origem = 'fatura' then left(nullif(trim(d.o_que_foi_gasto), ''), 120) end,
       case when d.origem = 'fatura'
             and d.categoria in ('Alimentação', 'Transporte', 'Hospedagem', 'Passagens', 'Compras',
                                 'Lazer & Passeios', 'Assinaturas', 'Saúde & Farmácia',
                                 'Taxas & Impostos', 'Outros')
            then d.categoria end,
       case when d.eh_parcelado and d.total_parcelas between 2 and 72
             and d.parcela_atual between 1 and d.total_parcelas then d.parcela_atual end,
       case when d.eh_parcelado and d.total_parcelas between 2 and 72
             and d.parcela_atual between 1 and d.total_parcelas then d.total_parcelas end,
       case when d.fatura_referencia ~ '^\d{4}-(0[1-9]|1[0-2])$' then d.fatura_referencia end,
       d.created_at
  from public.despesas d
 where d.user_id is not null
   and d.valor > 0 and d.valor <= 1000000
   and upper(coalesce(d.moeda, 'BRL')) = 'BRL'
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 5) ROTEIRO: dias (data opcional) + itens (a tabela antiga ganha dia_id).
-- ---------------------------------------------------------------------------
create table if not exists public.roteiro_dias (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  user_id        uuid default auth.uid() references auth.users (id) on delete set null,
  data           date,
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);
create index if not exists roteiro_dias_ws_idx on public.roteiro_dias (workspace_id, ordem);

alter table public.roteiro_itens add column if not exists dia_id uuid references public.roteiro_dias (id) on delete cascade;
alter table public.roteiro_itens add column if not exists ordem integer not null default 0;
alter table public.roteiro_itens add column if not exists atualizado_em timestamptz not null default now();
alter table public.roteiro_itens add column if not exists atualizado_por uuid references auth.users (id) on delete set null;
alter table public.roteiro_itens alter column user_id set default auth.uid();
create index if not exists roteiro_itens_dia_idx on public.roteiro_itens (dia_id, ordem);

do $$
begin
  -- NOT VALID: vale para o que for gravado daqui em diante, sem travar a
  -- migration por causa de linhas antigas.
  if not exists (select 1 from pg_constraint where conname = 'roteiro_itens_campos_check') then
    alter table public.roteiro_itens add constraint roteiro_itens_campos_check check (
      (titulo is null or char_length(titulo) <= 120)
      and (descricao is null or char_length(descricao) <= 500)
      and (horario is null or horario = '' or horario ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    ) not valid;
  end if;
end $$;

-- O item só pode apontar para um dia do MESMO espaço (a consulta passa pela
-- RLS: dia de outro casal é invisível e a gravação é recusada).
create or replace function public.antes_gravar_roteiro_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    if not public.mesclando_espacos() then
      new.workspace_id := old.workspace_id;
    end if;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  if new.dia_id is not null and not exists (
    select 1 from public.roteiro_dias d where d.id = new.dia_id and d.workspace_id = new.workspace_id
  ) then
    raise exception 'dia do roteiro inexistente neste espaço' using errcode = '23503';
  end if;
  new.atualizado_em := now();
  if auth.uid() is not null then
    new.atualizado_por := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_roteiro_itens_auditoria on public.roteiro_itens;
create trigger trg_roteiro_itens_auditoria
  before insert or update on public.roteiro_itens
  for each row execute function public.antes_gravar_roteiro_item();

drop trigger if exists trg_roteiro_dias_auditoria on public.roteiro_dias;
create trigger trg_roteiro_dias_auditoria
  before insert or update on public.roteiro_dias
  for each row execute function public.antes_gravar_registro();

-- ---------------------------------------------------------------------------
-- 6) CHECKLIST
-- ---------------------------------------------------------------------------
create table if not exists public.checklist_itens (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  user_id        uuid default auth.uid() references auth.users (id) on delete set null,
  texto          text not null,
  categoria      text not null default 'Mão / Essenciais',
  feito          boolean not null default false,
  ordem          integer not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'checklist_itens_campos_check') then
    alter table public.checklist_itens add constraint checklist_itens_campos_check check (
      char_length(texto) between 1 and 120 and char_length(categoria) between 1 and 40
    );
  end if;
end $$;

create index if not exists checklist_itens_ws_idx on public.checklist_itens (workspace_id, ordem);

drop trigger if exists trg_checklist_itens_auditoria on public.checklist_itens;
create trigger trg_checklist_itens_auditoria
  before insert or update on public.checklist_itens
  for each row execute function public.antes_gravar_registro();

-- ---------------------------------------------------------------------------
-- 7) ALERTAS DE PREÇO. O e-mail vai para quem criou (user_id). Os campos de
--    monitoramento (ultimo_*) só mudam pelo worker do cron (chave de serviço,
--    sem auth.uid()); mudar o alvo, as datas ou o trajeto zera o antispam.
-- ---------------------------------------------------------------------------
create table if not exists public.alertas_preco (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workspace_id            uuid references public.workspaces (id) on delete set null,
  tipo                    text not null,
  origem                  text,
  origem_iata             text,
  destino                 text not null,
  destino_iata            text,
  ida                     date not null,
  volta                   date,
  adultos                 smallint not null default 2,
  preco_alvo              numeric(12, 2),
  ativo                   boolean not null default true,
  ultimo_preco            numeric(12, 2),
  ultimo_link             text,
  ultima_verificacao_em   timestamptz,
  ultimo_preco_notificado numeric(12, 2),
  ultimo_disparo_em       timestamptz,
  criado_em               timestamptz not null default now(),
  atualizado_em           timestamptz not null default now(),
  atualizado_por          uuid references auth.users (id) on delete set null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'alertas_preco_campos_check') then
    alter table public.alertas_preco add constraint alertas_preco_campos_check check (
      tipo in ('voo', 'hospedagem')
      and (origem is null or char_length(origem) <= 80)
      and (origem_iata is null or origem_iata ~ '^[A-Z]{3}$')
      and char_length(destino) between 2 and 80
      and (destino_iata is null or destino_iata ~ '^[A-Z]{3}$')
      and (volta is null or volta >= ida)
      and (tipo = 'voo' or volta is not null)
      and adultos between 1 and 9
      and (preco_alvo is null or (preco_alvo > 0 and preco_alvo <= 1000000))
      and (ultimo_link is null or (char_length(ultimo_link) <= 2048 and ultimo_link like 'https://%'))
    );
  end if;
end $$;

create index if not exists alertas_preco_monitor_idx on public.alertas_preco (ativo, ida, ultima_verificacao_em);
create index if not exists alertas_preco_ws_idx on public.alertas_preco (workspace_id);
create index if not exists alertas_preco_user_idx on public.alertas_preco (user_id);

create or replace function public.antes_gravar_alerta()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.user_id := old.user_id;
    if not public.mesclando_espacos() then
      new.workspace_id := old.workspace_id;
    end if;
    new.criado_em := old.criado_em;
    if v_uid is not null then
      new.ultimo_preco := old.ultimo_preco;
      new.ultimo_link := old.ultimo_link;
      new.ultima_verificacao_em := old.ultima_verificacao_em;
      if (new.preco_alvo, new.ida, new.volta, new.origem_iata, new.destino_iata, new.destino, new.adultos)
         is distinct from
         (old.preco_alvo, old.ida, old.volta, old.origem_iata, old.destino_iata, old.destino, old.adultos) then
        new.ultimo_preco_notificado := null;
        new.ultimo_disparo_em := null;
      else
        new.ultimo_preco_notificado := old.ultimo_preco_notificado;
        new.ultimo_disparo_em := old.ultimo_disparo_em;
      end if;
    end if;
  elsif v_uid is not null then
    new.ultimo_preco := null;
    new.ultimo_link := null;
    new.ultima_verificacao_em := null;
    new.ultimo_preco_notificado := null;
    new.ultimo_disparo_em := null;
  end if;
  new.atualizado_em := now();
  if v_uid is not null then
    new.atualizado_por := v_uid;
  end if;
  return new;
end $$;

drop trigger if exists trg_alertas_preco_auditoria on public.alertas_preco;
create trigger trg_alertas_preco_auditoria
  before insert or update on public.alertas_preco
  for each row execute function public.antes_gravar_alerta();

-- ---------------------------------------------------------------------------
-- 8) DOCUMENTOS. `numero_cifrado` vem pronto da aplicação (AES-256-GCM com a
--    chave DOCUMENTOS_CHAVE_CRIPTO, que nunca chega ao banco nem ao navegador).
--    Sem a chave configurada, só `numero_final` (4 últimos) é gravado.
--    Fora do Realtime de propósito.
-- ---------------------------------------------------------------------------
create table if not exists public.documentos_viagem (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  workspace_id   uuid references public.workspaces (id) on delete set null,
  tipo           text not null,
  titular        text not null default '',
  numero_cifrado text,
  numero_final   text,
  validade       date,
  observacao     text not null default '',
  escopo         text not null default 'pessoal_privado',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documentos_viagem_campos_check') then
    alter table public.documentos_viagem add constraint documentos_viagem_campos_check check (
      char_length(tipo) between 1 and 40
      and char_length(titular) <= 120
      and (numero_cifrado is null or (char_length(numero_cifrado) <= 512 and numero_cifrado like 'v1:%'))
      and (numero_final is null or char_length(numero_final) between 1 and 4)
      and char_length(observacao) <= 300
      and escopo in ('viagem_compartilhado', 'pessoal_privado')
      and (escopo = 'pessoal_privado' or workspace_id is not null)
    );
  end if;
end $$;

create index if not exists documentos_viagem_user_idx on public.documentos_viagem (user_id);
create index if not exists documentos_viagem_ws_idx on public.documentos_viagem (workspace_id);

drop trigger if exists trg_documentos_viagem_auditoria on public.documentos_viagem;
create trigger trg_documentos_viagem_auditoria
  before insert or update on public.documentos_viagem
  for each row execute function public.antes_gravar_registro();

-- ---------------------------------------------------------------------------
-- 9) RLS
-- ---------------------------------------------------------------------------
alter table public.perfis enable row level security;
alter table public.acordos_divisao enable row level security;
alter table public.despesas_viagem enable row level security;
alter table public.roteiro_dias enable row level security;
alter table public.checklist_itens enable row level security;
alter table public.alertas_preco enable row level security;
alter table public.documentos_viagem enable row level security;

-- Membros dos meus espaços (para ler o perfil do par e validar pago_por).
create or replace function public.colegas_de_espaco()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct m.user_id
    from public.workspace_members m
   where m.workspace_id in (select workspace_id from public.workspace_members where user_id = auth.uid());
$$;

create or replace function public.membro_do_espaco(p_workspace uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members m where m.workspace_id = p_workspace and m.user_id = p_user
  );
$$;

-- perfis: cada um edita o seu; o par lê o nome e a chave Pix (para pagar).
drop policy if exists "perfis_select" on public.perfis;
drop policy if exists "perfis_insert" on public.perfis;
drop policy if exists "perfis_update" on public.perfis;
create policy "perfis_select" on public.perfis for select to authenticated
  using (user_id = (select auth.uid()) or user_id in (select public.colegas_de_espaco()));
create policy "perfis_insert" on public.perfis for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "perfis_update" on public.perfis for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- acordos: qualquer integrante do espaço lê e ajusta (é um combinado dos dois).
drop policy if exists "acordos_select" on public.acordos_divisao;
drop policy if exists "acordos_insert" on public.acordos_divisao;
drop policy if exists "acordos_update" on public.acordos_divisao;
create policy "acordos_select" on public.acordos_divisao for select to authenticated
  using (workspace_id in (select public.meus_workspaces()));
create policy "acordos_insert" on public.acordos_divisao for insert to authenticated
  with check (workspace_id in (select public.meus_workspaces()));
create policy "acordos_update" on public.acordos_divisao for update to authenticated
  using (workspace_id in (select public.meus_workspaces()))
  with check (workspace_id in (select public.meus_workspaces()));

-- despesas_viagem: o dono vê as suas; o par vê e corrige só as COMPARTILHADAS
-- do espaço. `pago_por` precisa ser alguém do espaço.
drop policy if exists "despesas_viagem_select" on public.despesas_viagem;
drop policy if exists "despesas_viagem_insert" on public.despesas_viagem;
drop policy if exists "despesas_viagem_update" on public.despesas_viagem;
drop policy if exists "despesas_viagem_delete" on public.despesas_viagem;
create policy "despesas_viagem_select" on public.despesas_viagem for select to authenticated
  using (
    user_id = (select auth.uid())
    or (escopo = 'viagem_compartilhado' and workspace_id in (select public.meus_workspaces()))
  );
create policy "despesas_viagem_insert" on public.despesas_viagem for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (workspace_id is null or workspace_id in (select public.meus_workspaces()))
    and (
      pago_por is null or pago_por = (select auth.uid())
      or (workspace_id is not null and public.membro_do_espaco(workspace_id, pago_por))
    )
  );
create policy "despesas_viagem_update" on public.despesas_viagem for update to authenticated
  using (
    user_id = (select auth.uid())
    or (escopo = 'viagem_compartilhado' and workspace_id in (select public.meus_workspaces()))
  )
  with check (
    (
      user_id = (select auth.uid())
      or (escopo = 'viagem_compartilhado' and workspace_id in (select public.meus_workspaces()))
    )
    and (
      pago_por is null or pago_por = user_id
      or (workspace_id is not null and public.membro_do_espaco(workspace_id, pago_por))
    )
  );
create policy "despesas_viagem_delete" on public.despesas_viagem for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (escopo = 'viagem_compartilhado' and workspace_id in (select public.meus_workspaces()))
  );

-- roteiro e checklist: do espaço (os dois leem e editam).
drop policy if exists "roteiro_dias_ws" on public.roteiro_dias;
create policy "roteiro_dias_ws" on public.roteiro_dias for all to authenticated
  using (workspace_id in (select public.meus_workspaces()))
  with check (workspace_id in (select public.meus_workspaces()));

drop policy if exists "checklist_itens_ws" on public.checklist_itens;
create policy "checklist_itens_ws" on public.checklist_itens for all to authenticated
  using (workspace_id in (select public.meus_workspaces()))
  with check (workspace_id in (select public.meus_workspaces()));

-- alertas: o par vê e ajusta (planejamento conjunto); o e-mail é de quem criou.
drop policy if exists "alertas_select" on public.alertas_preco;
drop policy if exists "alertas_insert" on public.alertas_preco;
drop policy if exists "alertas_update" on public.alertas_preco;
drop policy if exists "alertas_delete" on public.alertas_preco;
create policy "alertas_select" on public.alertas_preco for select to authenticated
  using (user_id = (select auth.uid()) or workspace_id in (select public.meus_workspaces()));
create policy "alertas_insert" on public.alertas_preco for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (workspace_id is null or workspace_id in (select public.meus_workspaces()))
  );
create policy "alertas_update" on public.alertas_preco for update to authenticated
  using (user_id = (select auth.uid()) or workspace_id in (select public.meus_workspaces()))
  with check (user_id = (select auth.uid()) or workspace_id in (select public.meus_workspaces()));
create policy "alertas_delete" on public.alertas_preco for delete to authenticated
  using (user_id = (select auth.uid()) or workspace_id in (select public.meus_workspaces()));

-- documentos: o dono edita; o par só LÊ os que o dono compartilhou.
drop policy if exists "documentos_select" on public.documentos_viagem;
drop policy if exists "documentos_insert" on public.documentos_viagem;
drop policy if exists "documentos_update" on public.documentos_viagem;
drop policy if exists "documentos_delete" on public.documentos_viagem;
create policy "documentos_select" on public.documentos_viagem for select to authenticated
  using (
    user_id = (select auth.uid())
    or (escopo = 'viagem_compartilhado' and workspace_id in (select public.meus_workspaces()))
  );
create policy "documentos_insert" on public.documentos_viagem for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (workspace_id is null or workspace_id in (select public.meus_workspaces()))
  );
create policy "documentos_update" on public.documentos_viagem for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (workspace_id is null or workspace_id in (select public.meus_workspaces()))
  );
create policy "documentos_delete" on public.documentos_viagem for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 10) PRIVILÉGIOS: anon sem nada; authenticated sem TRUNCATE/REFERENCES/
--     TRIGGER (TRUNCATE ignora RLS). As funções auxiliares não são API.
-- ---------------------------------------------------------------------------
revoke all on table
  public.perfis, public.acordos_divisao, public.despesas_viagem, public.roteiro_dias,
  public.checklist_itens, public.alertas_preco, public.documentos_viagem
from anon;
revoke truncate, references, trigger on table
  public.perfis, public.acordos_divisao, public.despesas_viagem, public.roteiro_dias,
  public.roteiro_itens, public.checklist_itens, public.alertas_preco, public.documentos_viagem
from authenticated;
revoke all on function public.colegas_de_espaco() from public, anon;
revoke all on function public.membro_do_espaco(uuid, uuid) from public, anon;
grant execute on function public.colegas_de_espaco() to authenticated;
grant execute on function public.membro_do_espaco(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11) MESCLA (v2): ao aceitar um convite, o que a pessoa planejou sozinha vai
--     para o espaço do casal — agora incluindo as tabelas novas. O acordo de
--     divisão do espaço individual não é levado (vale o do casal).
-- ---------------------------------------------------------------------------
create or replace function public.mesclar_espacos_individuais(p_uid uuid, p_destino uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origens uuid[];
begin
  select coalesce(array_agg(w.id), '{}') into v_origens
  from public.workspaces w
  where w.owner_id = p_uid
    and w.id <> p_destino
    and not exists (
      select 1 from public.workspace_members m
      where m.workspace_id = w.id and m.user_id <> p_uid
    );
  if coalesce(array_length(v_origens, 1), 0) = 0 then
    return;
  end if;
  -- Os triggers de auditoria congelam workspace_id; a marca (local a esta
  -- transação) autoriza a troca. Dias antes dos itens: o item valida o dia.
  perform set_config('pd.mesclando', 'on', true);
  update public.viagens set workspace_id = p_destino where workspace_id = any (v_origens);
  update public.despesas set workspace_id = p_destino where workspace_id = any (v_origens);
  update public.despesas_viagem set workspace_id = p_destino where workspace_id = any (v_origens);
  update public.alertas_preco set workspace_id = p_destino where workspace_id = any (v_origens);
  update public.documentos_viagem set workspace_id = p_destino where workspace_id = any (v_origens);
  update public.roteiro_dias set workspace_id = p_destino where workspace_id = any (v_origens);
  update public.roteiro_itens set workspace_id = p_destino where workspace_id = any (v_origens);
  update public.checklist_itens set workspace_id = p_destino where workspace_id = any (v_origens);
  perform set_config('pd.mesclando', 'off', true);
end $$;

revoke all on function public.mesclar_espacos_individuais(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12) REALTIME: gastos, roteiro, checklist, alertas e acordo chegam ao celular
--     do par na hora. O Realtime respeita a RLS de SELECT de cada assinante
--     (gasto privado do par nunca é entregue). Documentos ficam de fora.
-- ---------------------------------------------------------------------------
do $$
declare
  v_tabela text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publicação supabase_realtime ausente: Realtime não configurado neste banco.';
    return;
  end if;
  foreach v_tabela in array array['despesas_viagem', 'roteiro_dias', 'roteiro_itens',
                                  'checklist_itens', 'alertas_preco', 'acordos_divisao'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabela
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tabela);
    end if;
  end loop;
end $$;

-- 13) Conferência (opcional):
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';
-- select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 2;

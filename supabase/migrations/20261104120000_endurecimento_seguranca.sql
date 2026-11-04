-- DuoPlanner — Migration 20261104120000: endurecimento de segurança
-- ============================================================================
-- Consolida o antigo `supabase/security-hardening.sql` (removido) e acrescenta:
--   * convites com validade (7 dias), no máximo 2 pessoas por espaço e
--     e-mail vinculado quando o convite foi criado para um e-mail;
--   * RPC `obter_convite` para a tela de confirmação (sem expor a tabela);
--   * cotas de uso por usuário: tabela `uso_cotas` + RPC `consumir_cota`;
--   * `anon` sem nenhum privilégio nas tabelas do app (tudo exige login).
--
-- Como aplicar: Supabase → SQL Editor → cole o arquivo inteiro → Run.
-- Idempotente (pode rodar de novo). ADITIVA para o código em produção
-- (commit 4b35f70): `aceitar_convite(p_codigo)` mantém a mesma assinatura e o
-- mesmo retorno (ok, mensagem); o código antigo já preferia a RPC.
--
-- Por que: o esquema base usa políticas "fail-open" (`user_id is null`
-- permitido) e convites com `using (true)` — qualquer requisição anônima
-- lia/gravava linhas sem dono e listava todos os códigos de convite.
-- ============================================================================

-- 0) SANEAMENTO — linhas sem dono ficam invisíveis depois deste script.
--    Confira antes (em 30/10/2026 não havia nenhuma visível em produção):
--    select count(*) from public.viagens where user_id is null;
--    select count(*) from public.despesas where user_id is null;
-- delete from public.viagens          where user_id is null;
-- delete from public.despesas         where user_id is null and workspace_id is null;
-- delete from public.preferencias_duo where user_id is null;
-- delete from public.memoria_ia       where user_id is null;

-- Função auxiliar das políticas (recriada para o script não depender da ordem).
create or replace function public.meus_workspaces()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.workspace_members where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 1) Dados do próprio usuário: exige sessão. `(select auth.uid())` é avaliado
--    uma vez por consulta (initPlan), não uma vez por linha.
-- ---------------------------------------------------------------------------
drop policy if exists "viagens_owner" on public.viagens;
create policy "viagens_owner" on public.viagens
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "preferencias_duo_owner" on public.preferencias_duo;
create policy "preferencias_duo_owner" on public.preferencias_duo
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "memoria_ia_owner" on public.memoria_ia;
create policy "memoria_ia_owner" on public.memoria_ia
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2) Despesas (tabela legada; a nova é despesas_viagem): o dono vê as suas;
--    o parceiro vê só as COMPARTILHADAS do espaço. Privado nunca vaza.
-- ---------------------------------------------------------------------------
drop policy if exists "despesas_escopo" on public.despesas;
create policy "despesas_escopo" on public.despesas
  for all to authenticated
  using (
    (select auth.uid()) = user_id
    or (escopo = 'viagem_compartilhado' and workspace_id in (select public.meus_workspaces()))
  )
  with check ((select auth.uid()) = user_id);

-- Na dúvida, privado: despesa sem escopo informado nasce pessoal.
alter table public.despesas alter column escopo set default 'pessoal_privado';

-- ---------------------------------------------------------------------------
-- 3) Workspaces: membros leem; só o dono cria, altera e apaga. A política
--    antiga ("for all" para membros) deixava o parceiro trocar owner_id para
--    si ou apagar o espaço inteiro (com cascata nos dados).
-- ---------------------------------------------------------------------------
drop policy if exists "workspaces_membros" on public.workspaces;
drop policy if exists "workspaces_select" on public.workspaces;
drop policy if exists "workspaces_insert" on public.workspaces;
drop policy if exists "workspaces_update" on public.workspaces;
drop policy if exists "workspaces_delete" on public.workspaces;

create policy "workspaces_select" on public.workspaces
  for select to authenticated
  using ((select auth.uid()) = owner_id or id in (select public.meus_workspaces()));
create policy "workspaces_insert" on public.workspaces
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy "workspaces_update" on public.workspaces
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "workspaces_delete" on public.workspaces
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- 4) workspace_members: leitura do próprio vínculo e dos colegas de espaço;
--    sair do espaço (apagar o próprio vínculo). SEM insert/update pelo
--    cliente: o dono entra pela trigger e o parceiro pela RPC aceitar_convite
--    (ambas security definer). Antes, qualquer um se inseria em qualquer espaço.
-- ---------------------------------------------------------------------------
drop policy if exists "workspace_members_self" on public.workspace_members;
drop policy if exists "workspace_members_select" on public.workspace_members;
drop policy if exists "workspace_members_delete" on public.workspace_members;

create policy "workspace_members_select" on public.workspace_members
  for select to authenticated
  using ((select auth.uid()) = user_id or workspace_id in (select public.meus_workspaces()));
create policy "workspace_members_delete" on public.workspace_members
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 5) Convites: validade, e-mail normalizado e status inicial impostos pelo
--    banco (o cliente não escolhe). Leitura só por quem convidou ou membros.
-- ---------------------------------------------------------------------------
alter table public.convites
  add column if not exists expira_em timestamptz not null default (now() + interval '7 days');

create or replace function public.convites_normalizar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.status := 'pendente';
  new.expira_em := now() + interval '7 days';
  new.email_convidado := nullif(lower(trim(coalesce(new.email_convidado, ''))), '');
  return new;
end $$;

drop trigger if exists trg_convites_normalizar on public.convites;
create trigger trg_convites_normalizar
  before insert on public.convites
  for each row execute function public.convites_normalizar();

drop policy if exists "convites_membros" on public.convites;
drop policy if exists "convites_select" on public.convites;
drop policy if exists "convites_insert" on public.convites;
drop policy if exists "convites_update" on public.convites;

create policy "convites_select" on public.convites
  for select to authenticated
  using (
    (select auth.uid()) = convidado_por
    or workspace_id in (select public.meus_workspaces())
  );
create policy "convites_insert" on public.convites
  for insert to authenticated
  with check (
    (select auth.uid()) = convidado_por
    and workspace_id in (select public.meus_workspaces())
  );
-- Revogar: quem criou ou membro do workspace.
create policy "convites_update" on public.convites
  for update to authenticated
  using (
    (select auth.uid()) = convidado_por
    or workspace_id in (select public.meus_workspaces())
  );

-- ---------------------------------------------------------------------------
-- 6) Mescla dos espaços individuais: quem aceita um convite leva o que já
--    tinha planejado SOZINHO (espaços em que é a única pessoa) para o espaço
--    do casal — senão esses dados "sumiriam" da tela. A migration de
--    sincronização (20261104120100) recria esta função incluindo as tabelas
--    novas. Uso interno: só a RPC aceitar_convite chama.
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
  update public.viagens set workspace_id = p_destino where workspace_id = any (v_origens);
  update public.despesas set workspace_id = p_destino where workspace_id = any (v_origens);
  update public.roteiro_itens set workspace_id = p_destino where workspace_id = any (v_origens);
end $$;

revoke all on function public.mesclar_espacos_individuais(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) RPC aceitar_convite (v2). `for update` trava o convite e o espaço:
--    dois aceites simultâneos não passam juntos nem estouram 2 pessoas.
-- ---------------------------------------------------------------------------
create or replace function public.aceitar_convite(p_codigo text)
returns table (ok boolean, mensagem text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_convite record;
  v_membros integer;
begin
  if v_uid is null then
    return query select false, 'Entre na sua conta para aceitar o convite.'::text; return;
  end if;
  if p_codigo is null or p_codigo !~ '^[A-Za-z0-9-]{4,64}$' then
    return query select false, 'Convite inválido.'::text; return;
  end if;

  select c.id, c.workspace_id, c.status, c.expira_em, c.email_convidado
    into v_convite
    from public.convites c
   where c.codigo = p_codigo
   for update;
  if not found then
    return query select false, 'Convite inválido.'::text; return;
  end if;

  if exists (
    select 1 from public.workspace_members m
     where m.workspace_id = v_convite.workspace_id and m.user_id = v_uid
  ) then
    return query select true, 'Você já faz parte deste espaço.'::text; return;
  end if;
  if v_convite.status <> 'pendente' then
    return query select false,
      (case v_convite.status when 'revogado' then 'Este convite foi revogado.'
                             else 'Este convite já foi utilizado.' end)::text;
    return;
  end if;
  if v_convite.expira_em < now() then
    return query select false, 'Este convite expirou. Peça um novo link.'::text; return;
  end if;
  if v_convite.email_convidado is not null and lower(v_convite.email_convidado) <> v_email then
    return query select false,
      'Este convite foi criado para outro e-mail. Entre com a conta convidada ou peça um novo link.'::text;
    return;
  end if;

  perform 1 from public.workspaces w where w.id = v_convite.workspace_id for update;
  select count(*) into v_membros from public.workspace_members m where m.workspace_id = v_convite.workspace_id;
  if v_membros >= 2 then
    return query select false, 'Este espaço já tem duas pessoas.'::text; return;
  end if;

  insert into public.workspace_members (workspace_id, user_id, papel)
  values (v_convite.workspace_id, v_uid, 'parceiro')
  on conflict (workspace_id, user_id) do nothing;

  update public.convites set status = 'aceito' where id = v_convite.id;

  perform public.mesclar_espacos_individuais(v_uid, v_convite.workspace_id);

  return query select true, 'Conta vinculada ao espaço compartilhado!'::text;
end $$;

revoke all on function public.aceitar_convite(text) from public, anon;
grant execute on function public.aceitar_convite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) RPC obter_convite: o mínimo para a tela de confirmação (nome do espaço e
--    de quem convidou), só para quem tem o código e está logado.
-- ---------------------------------------------------------------------------
create or replace function public.obter_convite(p_codigo text)
returns table (valido boolean, mensagem text, nome_espaco text, nome_convidante text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_convite record;
  v_membros integer;
  v_nome text;
begin
  if v_uid is null then
    return query select false, 'Entre na sua conta para ver o convite.'::text, null::text, null::text; return;
  end if;
  if p_codigo is null or p_codigo !~ '^[A-Za-z0-9-]{4,64}$' then
    return query select false, 'Convite inválido.'::text, null::text, null::text; return;
  end if;

  select c.workspace_id, c.status, c.expira_em, c.email_convidado, c.convidado_por, w.nome as nome_ws
    into v_convite
    from public.convites c
    join public.workspaces w on w.id = c.workspace_id
   where c.codigo = p_codigo;
  if not found then
    return query select false, 'Convite inválido.'::text, null::text, null::text; return;
  end if;

  if exists (
    select 1 from public.workspace_members m
     where m.workspace_id = v_convite.workspace_id and m.user_id = v_uid
  ) then
    return query select false, 'Você já faz parte deste espaço.'::text, v_convite.nome_ws::text, null::text; return;
  end if;
  if v_convite.status <> 'pendente' then
    return query select false, 'Este convite não está mais disponível.'::text, null::text, null::text; return;
  end if;
  if v_convite.expira_em < now() then
    return query select false, 'Este convite expirou. Peça um novo link.'::text, null::text, null::text; return;
  end if;
  if v_convite.email_convidado is not null and lower(v_convite.email_convidado) <> v_email then
    return query select false,
      'Este convite foi criado para outro e-mail. Entre com a conta convidada ou peça um novo link.'::text,
      null::text, null::text;
    return;
  end if;
  select count(*) into v_membros from public.workspace_members m where m.workspace_id = v_convite.workspace_id;
  if v_membros >= 2 then
    return query select false, 'Este espaço já tem duas pessoas.'::text, null::text, null::text; return;
  end if;

  select coalesce(nullif(trim(u.raw_user_meta_data ->> 'nome'), ''), split_part(u.email, '@', 1))
    into v_nome
    from auth.users u
   where u.id = v_convite.convidado_por;

  return query select true, ''::text, v_convite.nome_ws::text, v_nome;
end $$;

revoke all on function public.obter_convite(text) from public, anon;
grant execute on function public.obter_convite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) roteiro_itens: só membros do workspace (remove o "workspace_id is null").
-- ---------------------------------------------------------------------------
drop policy if exists "roteiro_itens_ws" on public.roteiro_itens;
create policy "roteiro_itens_ws" on public.roteiro_itens
  for all to authenticated
  using (workspace_id in (select public.meus_workspaces()))
  with check (workspace_id in (select public.meus_workspaces()));

-- ---------------------------------------------------------------------------
-- 10) Cotas de uso por usuário (rate limit das rotas pagas e da IA).
--     Janela fixa; só a RPC toca a tabela (RLS ligado e sem políticas).
--     Os limites vêm do código (src/lib/seguranca/cotas-regras.ts); o banco
--     aceita apenas recursos conhecidos e limites dentro de faixas sãs. Um
--     cliente que chame a RPC direto só consegue gastar a PRÓPRIA cota.
-- ---------------------------------------------------------------------------
create table if not exists public.uso_cotas (
  user_id       uuid not null references auth.users (id) on delete cascade,
  recurso       text not null,
  janela_inicio timestamptz not null,
  contador      integer not null default 0,
  primary key (user_id, recurso, janela_inicio)
);
alter table public.uso_cotas enable row level security;

create or replace function public.consumir_cota(
  p_recurso text,
  p_limite integer,
  p_janela_segundos integer
)
returns table (permitido boolean, restante integer, reinicia_em timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inicio timestamptz;
  v_contador integer;
begin
  if v_uid is null then
    return query select false, 0, now(); return;
  end if;
  if p_recurso is null
     or p_recurso not in ('voos', 'hospedagem', 'ia', 'convite', 'documento')
     or p_limite is null or p_limite not between 1 and 10000
     or p_janela_segundos is null or p_janela_segundos not between 60 and 2678400 then
    raise exception 'consumir_cota: parâmetros inválidos' using errcode = '22023';
  end if;

  v_inicio := to_timestamp(floor(extract(epoch from now()) / p_janela_segundos) * p_janela_segundos);

  insert into public.uso_cotas as u (user_id, recurso, janela_inicio, contador)
  values (v_uid, p_recurso, v_inicio, 1)
  on conflict (user_id, recurso, janela_inicio)
  do update set contador = u.contador + 1
  returning u.contador into v_contador;

  -- Limpeza barata das janelas antigas deste usuário/recurso (usa a PK).
  delete from public.uso_cotas q
   where q.user_id = v_uid
     and q.recurso = p_recurso
     and q.janela_inicio < v_inicio - make_interval(secs => p_janela_segundos);

  return query select
    v_contador <= p_limite,
    greatest(p_limite - v_contador, 0),
    v_inicio + make_interval(secs => p_janela_segundos);
end $$;

revoke all on function public.consumir_cota(text, integer, integer) from public, anon;
grant execute on function public.consumir_cota(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 11) Menor privilégio: o app não acessa nenhuma tabela sem login. Mesmo que
--     uma política futura saia errada, o papel anônimo não lê nem grava nada.
-- ---------------------------------------------------------------------------
revoke all on table
  public.viagens, public.despesas, public.preferencias_duo, public.memoria_ia,
  public.workspaces, public.workspace_members, public.convites, public.roteiro_itens,
  public.uso_cotas
from anon;
revoke all on table public.uso_cotas from authenticated;

-- 12) Conferência (opcional):
-- select tablename, policyname, cmd, roles from pg_policies
--  where schemaname = 'public' order by tablename, policyname;

-- DuoPlanner — Endurecimento de segurança (RLS) para PRODUÇÃO
-- ============================================================================
-- Como aplicar: Supabase → SQL Editor → cole este arquivo inteiro → Run.
-- É idempotente (pode rodar de novo sem erro).
--
-- Quando: a qualquer momento depois do deploy que trouxe a RPC no código
-- (aceitarConvitePorCodigo usa `aceitar_convite` quando ela existe e o
-- caminho antigo enquanto ela não existe). Ordem segura: código antes, SQL
-- depois.
--
-- Por que: o schema.sql de desenvolvimento usa políticas "fail-open"
-- (`user_id is null` é permitido) para funcionar sem login. Em produção isso
-- é um VAZAMENTO: qualquer requisição anônima leria/gravaria linhas com
-- user_id nulo. Também: convites com `using (true)` (qualquer um lia todos os
-- códigos), membro podendo tomar posse ou APAGAR o workspace, e qualquer
-- usuário podendo se inserir em qualquer workspace.
-- ============================================================================

-- 0) SANEAMENTO — linhas sem dono ficam invisíveis depois deste script.
--    Confira antes (em produção, em 30/10/2026, não havia nenhuma visível):
--    select count(*) from public.viagens where user_id is null;
--    (Os deletes ficam comentados por segurança.)
-- delete from public.viagens          where user_id is null;
-- delete from public.despesas         where user_id is null and workspace_id is null;
-- delete from public.preferencias_duo where user_id is null;
-- delete from public.memoria_ia       where user_id is null;

-- Função auxiliar usada pelas políticas (mesma do schema.sql; recriada aqui
-- para o script não depender da ordem de aplicação).
create or replace function public.meus_workspaces()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.workspace_members where user_id = auth.uid();
$$;

-- 1) Dados do próprio usuário: exige sessão (auth.uid() não nulo).
drop policy if exists "viagens_owner" on public.viagens;
create policy "viagens_owner" on public.viagens
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "preferencias_duo_owner" on public.preferencias_duo;
create policy "preferencias_duo_owner" on public.preferencias_duo
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "memoria_ia_owner" on public.memoria_ia;
create policy "memoria_ia_owner" on public.memoria_ia
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2) Despesas: o dono vê as suas; parceiros do workspace veem apenas as
--    COMPARTILHADAS. Gasto pessoal_privado nunca vaza para o parceiro.
drop policy if exists "despesas_escopo" on public.despesas;
create policy "despesas_escopo" on public.despesas
  for all using (
    auth.uid() = user_id
    or (escopo = 'viagem_compartilhado' and workspace_id in (select public.meus_workspaces()))
  )
  with check (auth.uid() = user_id);

-- Na dúvida, privado: despesa sem escopo informado nasce pessoal.
alter table public.despesas alter column escopo set default 'pessoal_privado';

-- 3) Workspaces: membros leem; só o dono cria, altera e apaga. A política
--    antiga ("for all" para membros) deixava o parceiro trocar owner_id para
--    si ou apagar o espaço inteiro (com cascata nos dados).
drop policy if exists "workspaces_membros" on public.workspaces;
drop policy if exists "workspaces_select" on public.workspaces;
drop policy if exists "workspaces_insert" on public.workspaces;
drop policy if exists "workspaces_update" on public.workspaces;
drop policy if exists "workspaces_delete" on public.workspaces;

create policy "workspaces_select" on public.workspaces
  for select using (auth.uid() = owner_id or id in (select public.meus_workspaces()));
create policy "workspaces_insert" on public.workspaces
  for insert with check (auth.uid() = owner_id);
create policy "workspaces_update" on public.workspaces
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "workspaces_delete" on public.workspaces
  for delete using (auth.uid() = owner_id);

-- 4) workspace_members: leitura do próprio vínculo e dos colegas de espaço;
--    sair do espaço (apagar o próprio vínculo). NÃO há insert/update pelo
--    cliente: o dono entra pela trigger e o parceiro pela RPC aceitar_convite
--    (ambas security definer). Antes, `with check (auth.uid() = user_id)`
--    deixava qualquer um se inserir em qualquer workspace.
drop policy if exists "workspace_members_self" on public.workspace_members;
drop policy if exists "workspace_members_select" on public.workspace_members;
drop policy if exists "workspace_members_delete" on public.workspace_members;

create policy "workspace_members_select" on public.workspace_members
  for select using (auth.uid() = user_id or workspace_id in (select public.meus_workspaces()));
create policy "workspace_members_delete" on public.workspace_members
  for delete using (auth.uid() = user_id);

-- 5) Convites: só quem convidou ou membros do workspace leem; criação só por
--    membro do workspace; aceite pela RPC (sem expor a tabela).
drop policy if exists "convites_membros" on public.convites;
drop policy if exists "convites_select" on public.convites;
drop policy if exists "convites_insert" on public.convites;
drop policy if exists "convites_update" on public.convites;

create policy "convites_select" on public.convites
  for select using (
    auth.uid() = convidado_por
    or workspace_id in (select public.meus_workspaces())
  );

create policy "convites_insert" on public.convites
  for insert with check (
    auth.uid() = convidado_por
    and workspace_id in (select public.meus_workspaces())
  );

-- Revogar: quem criou ou membro do workspace.
create policy "convites_update" on public.convites
  for update using (
    auth.uid() = convidado_por
    or workspace_id in (select public.meus_workspaces())
  );

-- 6) RPC para ACEITAR convite por código. O app chama
--    supabase.rpc('aceitar_convite', { p_codigo }). `for update` trava o
--    convite: dois aceites simultâneos do mesmo código não passam juntos.
create or replace function public.aceitar_convite(p_codigo text)
returns table (ok boolean, mensagem text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid;
  v_id  uuid;
  v_status text;
begin
  if v_uid is null then
    return query select false, 'Entre na sua conta para aceitar o convite.'; return;
  end if;

  select id, workspace_id, status into v_id, v_ws, v_status
  from public.convites where codigo = p_codigo
  limit 1
  for update;

  if v_id is null then
    return query select false, 'Convite inválido.'; return;
  end if;
  if v_status <> 'pendente' then
    return query select false, 'Este convite não está mais disponível.'; return;
  end if;

  insert into public.workspace_members (workspace_id, user_id, papel)
  values (v_ws, v_uid, 'parceiro')
  on conflict (workspace_id, user_id) do nothing;

  update public.convites set status = 'aceito' where id = v_id;
  return query select true, 'Conta vinculada ao espaço compartilhado!';
end $$;

revoke all on function public.aceitar_convite(text) from public, anon;
grant execute on function public.aceitar_convite(text) to authenticated;

-- 7) roteiro_itens: só membros do workspace (remove o "workspace_id is null").
drop policy if exists "roteiro_itens_ws" on public.roteiro_itens;
create policy "roteiro_itens_ws" on public.roteiro_itens
  for all using (workspace_id in (select public.meus_workspaces()))
  with check (workspace_id in (select public.meus_workspaces()));

-- 8) Conferência (opcional): deve listar só as políticas acima.
-- select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' order by tablename, policyname;

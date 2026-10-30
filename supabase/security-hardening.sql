-- DuoPlanner — Endurecimento de segurança (RLS) para PRODUÇÃO com Auth ativo
-- ============================================================================
-- Execute este script NO SUPABASE depois que o login real (Supabase Auth)
-- estiver ligado e NÃO houver mais linhas legadas com user_id NULL.
--
-- Por que: o schema.sql de desenvolvimento usa políticas "fail-open"
-- (`user_id is null` é permitido) para funcionar sem login na Fase Front.
-- Em produção isso é um VAZAMENTO: qualquer requisição anônima leria/gravaria
-- linhas com user_id nulo. Este script fecha as políticas para exigir sessão.
--
-- IMPORTANTE: rode antes um saneamento das linhas órfãs (ver passo 0).
-- ============================================================================

-- 0) SANEAMENTO — remova ou atribua dono às linhas sem user_id antes de fechar.
--    (Revise manualmente; o delete abaixo está comentado por segurança.)
-- delete from public.viagens          where user_id is null;
-- delete from public.despesas         where user_id is null and workspace_id is null;
-- delete from public.preferencias_duo where user_id is null;
-- delete from public.memoria_ia       where user_id is null;

-- 1) exige sessão (auth.uid() não nulo) em todas as tabelas de dados do usuário
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

-- 2) despesas: dono vê as suas; parceiros do workspace veem apenas as
--    COMPARTILHADAS. Gastos pessoais_privados nunca vazam para o parceiro.
drop policy if exists "despesas_escopo" on public.despesas;
create policy "despesas_escopo" on public.despesas
  for all using (
    auth.uid() = user_id
    or (escopo = 'viagem_compartilhado' and workspace_id in (select public.meus_workspaces()))
  )
  with check (auth.uid() = user_id);

-- 3) workspaces: dono ou membro.
drop policy if exists "workspaces_membros" on public.workspaces;
create policy "workspaces_membros" on public.workspaces
  for all using (auth.uid() = owner_id or id in (select public.meus_workspaces()))
  with check (auth.uid() = owner_id);

-- 4) workspace_members: o próprio usuário ou membros do mesmo workspace.
drop policy if exists "workspace_members_self" on public.workspace_members;
create policy "workspace_members_self" on public.workspace_members
  for all using (auth.uid() = user_id or workspace_id in (select public.meus_workspaces()))
  with check (auth.uid() = user_id);

-- 5) CONVITES — o ponto mais crítico. A política antiga era `using (true)`,
--    permitindo a QUALQUER UM ler/alterar todos os convites (enumeração de
--    códigos). Fecha para: só quem convidou ou membros do workspace leem;
--    criação só por membro do workspace; aceite feito por RPC controlada.
drop policy if exists "convites_membros" on public.convites;

-- 5a) leitura: quem criou ou membros do workspace do convite.
create policy "convites_select" on public.convites
  for select using (
    auth.uid() = convidado_por
    or workspace_id in (select public.meus_workspaces())
  );

-- 5b) criação: só membro do workspace pode gerar convite daquele workspace.
create policy "convites_insert" on public.convites
  for insert with check (
    auth.uid() = convidado_por
    and workspace_id in (select public.meus_workspaces())
  );

-- 5c) atualização (revogar): só quem criou ou membro do workspace.
create policy "convites_update" on public.convites
  for update using (
    auth.uid() = convidado_por
    or workspace_id in (select public.meus_workspaces())
  );

-- 6) RPC segura para ACEITAR convite por código sem expor a tabela inteira.
--    O cliente chama supabase.rpc('aceitar_convite', { p_codigo }) em vez de
--    ler/escrever direto em `convites`/`workspace_members`.
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
  from public.convites where codigo = p_codigo limit 1;

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

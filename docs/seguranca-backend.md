# DuoPlanner — Análise de Segurança do Back-end (LGPD + Proteção de Dados)

Documento de auditoria e plano de ação. Atualizado após a finalização do front
e o início do foco em back-end/segurança.

## Resumo executivo

O app usa Supabase (Postgres + Auth + RLS) com a chave **anon/publishable** no
cliente e no servidor (nenhuma `service_role` exposta — isso está correto). A
proteção de dados depende quase inteiramente das **políticas RLS**. A auditoria
encontrou riscos **altos** nessas políticas (herdados do modo de desenvolvimento
sem login) e pontos de endurecimento no fluxo de convite e senha.

As correções de **código** já foram aplicadas nesta entrega. As correções de
**banco (RLS/RPC)** estão prontas em `supabase/security-hardening.sql` para rodar
no Supabase quando o login real estiver ativo.

---

## Achados por severidade

### 🔴 ALTO

1. **RLS "fail-open" com `user_id is null`** (`supabase/schema.sql`, seção 5)
   Todas as políticas de dados do usuário permitem `user_id is null`. Isso é uma
   conveniência da Fase Front (sem login), mas em produção qualquer requisição
   anônima lê/grava linhas de `user_id` nulo. Se existirem linhas legadas nulas
   ou algum insert omitir `user_id`, há vazamento entre usuários.
   **Correção:** `security-hardening.sql` passos 1–4 exigem `auth.uid() = user_id`.
   Rodar após sanear linhas órfãs.

2. **Política de `convites` totalmente aberta** (`using (true) with check (true)`)
   Qualquer um podia ler/alterar **todos** os convites (códigos e e-mails),
   permitindo enumeração de códigos e entrada indevida em workspaces.
   **Correção:** `security-hardening.sql` passo 5 restringe leitura/criação/
   atualização a quem convidou ou a membros do workspace, e passo 6 cria a RPC
   `aceitar_convite(p_codigo)` (`security definer`) para aceitar sem expor a
   tabela. O cliente passa a chamar `supabase.rpc('aceitar_convite', ...)`.

3. **Aceite de convite sem checar estado** (código — JÁ CORRIGIDO)
   `aceitarConvitePorCodigo` só barrava `revogado`. Agora exige status
   `pendente` (recusa aceitos/expirados). Fica redundante e seguro com a RPC do
   banco.

### 🟠 MÉDIO

4. **Política de senha fraca** (código — JÁ CORRIGIDO)
   Era mínimo de 6 caracteres. Agora: mínimo de 8 **e** exige letra + número.
   Recomenda-se ativar no Supabase Auth: proteção contra senhas vazadas
   (HaveIBeenPwned), confirmação de e-mail obrigatória e rate limit de login.

5. **Dados sensíveis em `localStorage` sem criptografia**
   Documentos, finanças, roteiro e preferências ficam em `localStorage` em
   texto puro (a própria tela de Documentos já avisa). Para LGPD, dados de
   documentos (passaporte, etc.) não devem persistir assim em produção.
   **Plano:** migrar a persistência para o Supabase (com RLS) e, para campos
   sensíveis, avaliar criptografia em repouso / não armazenar número completo.

6. **`roteiro_itens` com `workspace_id is null` permitido** — mesmo problema do
   item 1. Corrigido no passo 7 do script.

### 🟡 BAIXO / BOAS PRÁTICAS

7. **Cabeçalhos de segurança HTTP** — adicionar CSP, `X-Content-Type-Options`,
   `Referrer-Policy`, `X-Frame-Options` via `next.config.ts headers()`.
8. **Confirmação de e-mail** — garantir que está ativa no Supabase (o código já
   trata o caso `!data.session`).
9. **Entradas da IA** — a Nora e o parser são determinísticos e client-side;
   nenhum `eval`/HTML injetado. As URLs de deep link são escapadas via
   `URLSearchParams`/`encodeURIComponent` (verificado nos testes).
10. **Segredos** — `.env.local` está no `.gitignore`; nenhuma chave no repo.
    Chaves de API externas (Kiwi/RapidAPI/Gemini) só são lidas no servidor.

---

## O que já está correto

- Sem `service_role` no cliente/servidor; só a chave anon + RLS.
- `getCurrentUserId` valida o JWT com `getClaims()` (não confia em `getSession`).
- Proxy (`src/proxy.ts`) protege `/dashboard/*`, fail-closed em produção.
- Deep links escapados; sem injeção de URL.
- Mensagens de erro de auth genéricas (não revelam se o e-mail existe além do
  necessário).

---

## Plano de ação (ordem recomendada)

1. **Ligar o Supabase Auth de verdade** (e-mail/senha + confirmação).
2. Sanear linhas com `user_id`/`workspace_id` nulos.
3. Rodar `supabase/security-hardening.sql`.
4. Trocar `aceitarConvitePorCodigo` para usar a RPC `aceitar_convite`.
5. Migrar persistência de documentos/finanças/roteiro do `localStorage` para o
   Supabase com RLS.
6. Adicionar cabeçalhos de segurança no `next.config.ts`.
7. Ativar proteção contra senha vazada e rate limit no painel do Supabase.

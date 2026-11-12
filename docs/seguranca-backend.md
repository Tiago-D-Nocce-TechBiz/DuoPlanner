# DuoPlanner — Segurança do Back-end (LGPD + Proteção de Dados)

Estado dos controles e do que ainda falta para produção. Atualizado em
12/11/2026, com a branch `feat/producao-saas` (Épicos 1 a 4 e a rodada
"Fluidez e Confiabilidade").

## Resumo

- O navegador e as Server Actions usam só a chave **publishable** do
  Supabase; a proteção dos dados é a **RLS** do Postgres. A chave **secreta**
  existe só no servidor e só nas tarefas agendadas (`/api/cron/*`).
- Os riscos altos da auditoria anterior (RLS "fail-open" com
  `user_id is null` e convites com `using (true)`) estão corrigidos em
  `supabase/migrations/20261104120000_endurecimento_seguranca.sql`.
  **Enquanto esse SQL não for aplicado em produção, eles continuam valendo.**
- Finanças, roteiro, checklist, alertas e documentos saíram do
  `localStorage` para o Postgres com RLS
  (`20261104120100_sincronizacao_casal.sql`). No aparelho fica só uma cópia
  para uso offline, apagada no logout.

## Controles em vigor

### Sessão e autorização (código)

- Toda Server Action passa por `withAuthAction` (`src/lib/acoes/com-sessao.ts`):
  sessão obrigatória via `obterSessao()` (`src/lib/auth/sessao.ts`, que valida
  o JWT com `getClaims()`), entrada validada por zod e resposta padronizada
  `{ success, data, error, code }`. Erro inesperado vira `ERRO_INTERNO` com
  mensagem genérica e uma referência curta; o detalhe fica só no log do
  servidor, com a mesma referência, e nenhum stack trace chega ao navegador.
  Os sinais internos do Next (redirect, notFound) passam intactos. As rotas privadas chamam `obterSessao()` direto. O proxy
  (`src/proxy.ts`) é só a primeira camada: Server Actions aceitam POST em
  qualquer rota. Em produção, sem as variáveis do Supabase, o painel fica
  bloqueado (fail-closed).
- Telas de erro (`error.tsx`, `global-error.tsx`): em produção mostram só o
  código do incidente (digest), nunca a mensagem técnica.
- `user_id` e `workspace_id` vêm sempre da sessão, nunca do cliente; cada
  operação da fila offline é validada por zod (`src/lib/sync/esquemas.ts`).
- Login e cadastro validados por zod; o cadastro responde igual para e-mail
  novo e já cadastrado (sem enumeração de contas); senha de 8+ caracteres com
  letra e número; `?redirect` só para `/dashboard/...` (sem open redirect).
- Convite: abrir o link não aceita mais nada; a tela mostra quem convidou e o
  aceite é um POST. A RPC `aceitar_convite` exige convite pendente e dentro
  da validade (7 dias), no máximo 2 pessoas por espaço e, quando o convite foi
  criado para um e-mail, aquele e-mail.
- Logout apaga os dados `pd-*` do navegador e os caches do Service Worker
  com dados do usuário.

### Banco (RLS)

- Sem "fail-open": cada linha exige dono (`auth.uid() = user_id`) ou o espaço
  do casal (`meus_workspaces()`). `anon` não tem privilégio nas tabelas do app;
  `authenticated` não tem `TRUNCATE` (que ignoraria a RLS).
- Gastos e documentos **privados** só são vistos pelo dono. Os
  **compartilhados** são vistos pelo par; documentos compartilhados são só
  leitura para o par. Triggers impedem trocar o dono, o espaço e a data de
  criação de uma linha, e o par não consegue tornar privado um gasto do outro.
- CHECKs no banco espelham a validação do servidor (valores, moedas, datas,
  parcelas, links https, número de documento sempre cifrado).
- Fatura reimportada não duplica: índice único `(user_id,
  transaction_fingerprint)` e gatilho que impede mudar o fingerprint depois
  de gravado (`20261105120000_fingerprint_fatura.sql`).
- As migrations rodam em ordem num Postgres em WASM a cada `npm test`
  (`tests/sql/`), com testes da RLS do casal, dos CHECKs e dos gatilhos.

### Ambiente (fail-fast)

- `src/lib/env/` valida as variáveis com zod no build (`next.config.ts`) e em
  cada instância do servidor (`instrumentation.ts`). Chave secreta numa
  variável `NEXT_PUBLIC_` (iria para o navegador e ignoraria a RLS), chave
  pública no lugar da secreta, URL inválida, `CRON_SECRET` curto ou chave de
  cifra sem 32 bytes interrompem o build: a configuração quebrada não vai ao
  ar. Variável ausente deixa só aquela integração em modo degradado.
- O navegador lê só `NEXT_PUBLIC_*` por nome literal (`src/lib/env/publico.ts`)
  e recusa usar uma chave com cara de secreta mesmo se alguém a expuser.

### Dados sensíveis

- Números de documentos: AES-256-GCM na aplicação, com contexto
  (`documento:dono`) autenticado; a chave `DOCUMENTOS_CHAVE_CRIPTO` fica na
  Vercel, fora do banco. Sem a chave, só os 4 últimos dígitos são gravados.
  Documentos ficam fora do Realtime e da fila offline.
- Recibos: a imagem vai ao Gemini só para leitura; nada é gravado sem a
  confirmação do usuário. Fatura: só descrição e valor de cada linha vão à IA.

### Custos e abuso

- Cotas por usuário no Postgres (RPC `consumir_cota`, janela fixa): voos e
  hospedagem 30/hora, IA 20/hora (cada lote de 40 linhas da fatura conta
  um), convites 10/dia, documentos 30/hora. Se o banco falhar, a cota nega
  (fail-closed); se a RPC ainda não existir, vale um limite em memória.

### Tarefas agendadas e e-mail (Épico 4)

- `/api/cron/*` exige `Authorization: Bearer ${CRON_SECRET}`, comparado em
  tempo constante; sem segredo ou com menos de 16 caracteres, a tarefa é
  recusada (503). A rota é pública e dispara buscas pagas e e-mails.
- A chave secreta ignora a RLS, então as regras de visibilidade das tarefas
  ficam no código e têm teste: o resumo semanal soma só os gastos
  compartilhados do espaço e os privados do próprio destinatário
  (`montarResumoSemanal`).
- E-mails (Resend, API HTTP): valores escapados no HTML, nomes digitados
  limpos e encurtados, só links https; chave de idempotência por e-mail (sem
  duplicar ao repetir); logs com o destinatário mascarado. Sem
  `RESEND_API_KEY`, nada sai.
- O e-mail de convite vai para um endereço digitado por outro usuário. O
  conteúdo é fixo (só nome de quem convida e nome do espaço, limpos), limitado
  pela cota de 10 convites por dia.

### Cabeçalhos HTTP

`next.config.ts` aplica `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Strict-Transport-Security` e `Permissions-Policy`. O
`sw.js` tem CSP própria (mesma origem) e nunca fica em cache.

## Pendências para produção

1. Aplicar no SQL Editor, em ordem: `20261104120000_endurecimento_seguranca.sql`
   (antes, conferir linhas sem dono com as consultas do topo do arquivo),
   `20261104120100_sincronizacao_casal.sql` e
   `20261105120000_fingerprint_fatura.sql`.
2. Cadastrar na Vercel: `SUPABASE_SECRET_KEY`, `CRON_SECRET`,
   `RESEND_API_KEY`, `EMAIL_REMETENTE` (domínio verificado na Resend, com SPF
   e DKIM) e `DOCUMENTOS_CHAVE_CRIPTO`.
3. Supabase → Authentication: confirmação de e-mail ligada, Redirect URL
   `https://duoplanner-vert.vercel.app/auth/callback` e proteção contra
   senhas vazadas.
4. Depois do deploy, rodar de novo a migration de sincronização (copia o que a
   versão anterior gravou na tabela antiga `despesas`).

## Riscos que continuam

- **CSP estrita ausente** no app (só no `sw.js`): scripts inline do Next,
  fontes e o WebGL do 3D exigiriam nonce. Mitigação atual: sem HTML de
  usuário renderizado e entradas validadas.
- **Tabela antiga `despesas`**: fica até uma migration de remoção (expandir
  antes de contrair). Depois de confirmar a cópia, revogar o acesso e apagar.
- **Rate limit de login**: depende do Supabase Auth (configurável no painel).
- **Chave secreta**: quem tiver acesso às variáveis da Vercel lê todos os
  dados. Restringir o acesso ao projeto e trocar a chave se houver suspeita.

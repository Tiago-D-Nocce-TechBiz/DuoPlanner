# DuoPlanner

App **pessoal e gratuito** para planejar viagens e finanças a dois, em
**Next.js (App Router)** + **TypeScript** + **Supabase**. Uso não corporativo.
Interface 100% em **Português do Brasil**.

Repositório: `Tiago-D-Nocce-TechBiz/DuoPlanner`. Produção: Vercel (todo push
em `main` vai direto para produção; não há ambiente de homologação).

## Stack

- Next.js 16 (App Router, Cache Components, Server Actions) e React 19
- Tailwind CSS v4, ícones SVG próprios (`src/components/ui/icons.tsx`)
- Supabase: Auth (e-mail e senha), Postgres com RLS e Realtime
- Zod 4 na fronteira de confiança (Server Actions, rotas e respostas de IA)
- Google Gemini via LangChain (leitura de recibos, categorização de fatura,
  memória de preferências)
- Resend (e-mails transacionais) e Vercel Cron (tarefas agendadas)
- PWA: manifesto, Service Worker próprio (`public/sw.js`) e fila offline
- Vitest (regras de negócio e as migrations num Postgres em WASM, PGlite) e
  Playwright (fluxos de tela no Microsoft Edge instalado)

Tipografia: Playfair Display nos títulos e Manrope no corpo. Temas Claro e
Escuro com tokens CSS em `src/app/globals.css`.

## Funcionalidades

- **Buscar Passagens e Hospedagem**: links pré-preenchidos para os parceiros
  (`src/lib/deep-links.ts`) e, com as chaves configuradas, preços pela Kiwi.com
  (voos) e pela Booking.com via RapidAPI (hospedagem), com cota por usuário.
- **DuoFinance**: importação de fatura de cartão (CSV, TXT ou texto colado)
  em duas fases. Na hora, no navegador: separa à vista e parcelado, limpa o
  nome das lojas, categoriza pelo catálogo local e monta o Raio-X. Em segundo
  plano: só as compras que o catálogo não reconheceu vão ao Gemini, sem travar
  a revisão. Reimportar a mesma fatura não duplica nada: cada compra tem um
  `transaction_fingerprint`, e a já importada aparece como "Já importado
  anteriormente (Ignorado)". Valores em centavos inteiros: R$ 10,01 dividido
  por dois vira R$ 5,01 + R$ 5,00. Também lê recibos e comprovantes Pix com
  IA (sempre com confirmação) e aceita lançamento manual em qualquer moeda.
- **Acerto de Contas**: 50/50, proporcional à renda (ex.: 60/40) ou valor
  fixo, com Pix Copia e Cola (BR Code EMV).
- **Roteiro, Checklist, Alertas de Preço e Documentos**: sincronizados entre
  o casal (Realtime), com o que é pessoal visível só para quem lançou.
  Números de documentos são cifrados (AES-256-GCM). Remover um gasto ou um
  item do roteiro ou do checklist dá 5 s para "Desfazer"; o selo do cabeçalho
  mostra "Sincronizado na nuvem", "Salvando alterações..." ou "Offline (Salvo
  neste aparelho)".
- **Conversor de Moedas**: cotação do dia (AwesomeAPI, cache de 1 h) e o
  comparador **"Qual cartão usar?"** (VET de cartão de crédito, conta global e
  espécie, com IOF de 3,5% e spreads editáveis).
- **E-mails**: alerta de queda de preço, resumo semanal do orçamento (toda
  segunda) e convite para o espaço do casal. Os dois primeiros podem ser
  desligados em Configurações.
- **PWA**: instalável (Android e iOS), abre offline com a última cópia e
  sincroniza as alterações quando a conexão volta.
- **Nora**: assistente do painel (regras locais; o que ela propõe gravar
  passa por confirmação).

## Estrutura

```
src/
  app/
    (auth)/                 login, cadastro e Server Actions de acesso
    api/
      flights/ hotels/      buscas pagas (sessão + cota por usuário)
      cotacoes/             câmbio do dia (estático, revalida a cada 1 h)
      cron/price-alerts/    monitor diário dos alertas (Bearer CRON_SECRET)
      cron/resumo-semanal/  resumo semanal por e-mail (Bearer CRON_SECRET)
    convite/                confirmação do convite (aceite por POST)
    dashboard/              painel: financas, acerto, roteiro, checklist,
                            alertas, documentos, conversor, configuracoes...
    manifest.ts             manifesto do PWA
  components/               UI por área (finance, financas, cambio, pwa, sync...)
  instrumentation.ts        valida o ambiente em cada instância do servidor
  lib/
    env/                    ambiente validado (zod): fail-fast e modo degradado
    acoes/                  withAuthAction: sessão, zod e resultado padronizado
    auth/                   sessão verificada (getClaims) e validação (zod)
    sync/                   motor de sincronização, fila offline e modelos
    finance/                dinheiro em centavos (money.ts), fingerprint,
                            importação, analisador de fatura, acerto, resumo
    cambio/                 cotações e VET
    email/ mail.ts          modelos de e-mail e envio pela Resend
    cron/ alertas/          tarefas agendadas e regra de aviso dos alertas
    seguranca/              cotas por usuário e cifra de documentos
    supabase/               clientes (navegador, servidor, admin só p/ cron)
supabase/migrations/        SQL versionado (aplicar no SQL Editor, em ordem)
tests/sql/                  migrations e RLS num Postgres em WASM (Vitest)
tests/e2e/                  fluxos de tela (Playwright)
public/sw.js                Service Worker
vercel.json                 agenda das tarefas (cron)
```

## Variáveis de ambiente

Copie `.env.example` para `.env.local` (ignorado pelo Git). Na Vercel,
cadastre as mesmas variáveis em Settings → Environment Variables.

O ambiente é validado com zod (`src/lib/env/`) no `next.config.ts` (build,
`next dev` e `next start`) e no `instrumentation.ts` (cada instância do
servidor):

- **Valor malformado interrompe o build** (fail-fast): chave secreta numa
  variável `NEXT_PUBLIC_` (iria para o navegador), URL inválida,
  `CRON_SECRET` curto, `DOCUMENTOS_CHAVE_CRIPTO` sem 32 bytes, URL do Supabase
  sem a chave pública. O deploy quebrado não vai ao ar.
- **Variável ausente não quebra nada**: a integração fica em modo degradado.
  O log do build lista cada integração como `[ativa]` ou `[degradada]` e o
  que o app faz sem ela.

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sim | contas, banco e Realtime (sem elas, o painel fica bloqueado em produção) |
| `NEXT_PUBLIC_SITE_URL` | recomendada | links de convite e dos e-mails (padrão: `https://duoplanner-vert.vercel.app`) |
| `SUPABASE_SECRET_KEY` (ou `SUPABASE_SERVICE_ROLE_KEY`) | para os crons | lê os dados de várias contas nas tarefas agendadas; nunca vai ao navegador |
| `CRON_SECRET` | para os crons | 16+ caracteres; a Vercel envia como `Authorization: Bearer` |
| `RESEND_API_KEY` / `EMAIL_REMETENTE` | para e-mails | sem a chave, nada é enviado (só registro no log) |
| `DOCUMENTOS_CHAVE_CRIPTO` | recomendada | 32 bytes em base64; sem ela, só os 4 últimos dígitos dos documentos são guardados |
| `GEMINI_API_KEY` (`GEMINI_MODEL`) | opcional | recibos e categorização por IA (sem ela, o catálogo local categoriza a fatura) |
| `KIWI_API_KEY` / `RAPIDAPI_KEY` | opcionais | preços de voos e hospedagens (sem elas, só os links dos parceiros) |

Gerar segredos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # DOCUMENTOS_CHAVE_CRIPTO
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"      # CRON_SECRET
```

`EMAIL_REMETENTE` precisa ser de um domínio verificado na Resend. O padrão
`onboarding@resend.dev` só entrega para o e-mail da própria conta da Resend
(serve para testar). O plano gratuito da Resend tem cota diária e mensal.

## Banco de dados (Supabase)

Não há CLI de migrations neste projeto: cada arquivo de
`supabase/migrations/` é colado no **SQL Editor** e executado, na ordem do
nome. Todos são idempotentes (podem rodar de novo).

1. `20261030000000_esquema_base.sql`: esquema base (o antigo `schema.sql`, já
   aplicado em produção).
2. `20261104120000_endurecimento_seguranca.sql`: RLS sem "fail-open",
   convites com validade e no máximo 2 pessoas, cotas por usuário. Confira
   antes as linhas sem dono (consultas no topo do arquivo).
3. `20261104120100_sincronizacao_casal.sql`: tabelas do casal (perfis,
   acordo de divisão, despesas_viagem, roteiro, checklist, alertas,
   documentos), RLS, Realtime e cópia da tabela antiga `despesas`.
4. `20261104_duofinance_fatura.sql`: colunas da fatura na tabela antiga
   `despesas` (usada pela versão anterior do importador). Opcional depois do 3.
5. `20261105120000_fingerprint_fatura.sql`: coluna `transaction_fingerprint`
   em `despesas_viagem`, índice único por pessoa e gatilho que a torna
   imutável. **Obrigatória para esta versão**: sem ela, o app detecta a coluna
   ausente e fica em "modo local" (nada se perde, a fila espera no aparelho).

`npm test` aplica todas as migrations, em ordem, num Postgres em WASM
(`tests/sql/`) e confere a RLS, os CHECKs e os gatilhos.

No Supabase → Authentication: confirmação de e-mail ligada, Site URL e
Redirect URL `https://<seu-domínio>/auth/callback`, e proteção contra senhas
vazadas.

## Publicar (ordem segura)

1. Aplicar as migrations 2, 3 e 5, nessa ordem (são aditivas: a versão em
   produção continua funcionando com elas).
2. Cadastrar as variáveis novas na Vercel (produção).
3. Fazer o merge em `main` (deploy).
4. Logo depois do deploy, rodar de novo a migration 3: ela copia para
   `despesas_viagem` o que a versão anterior gravou na tabela antiga nesse
   intervalo, sem duplicar.
5. Testar as tarefas à mão:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<seu-domínio>/api/cron/price-alerts
curl -H "Authorization: Bearer $CRON_SECRET" https://<seu-domínio>/api/cron/resumo-semanal
```

## Tarefas agendadas

Definidas em `vercel.json` (horários em UTC; só rodam no deploy de produção):

- `/api/cron/price-alerts`: todo dia às 11:00 UTC (08:00 em Brasília).
  Consulta o menor preço de cada alerta ativo, guarda o preço e avisa por
  e-mail quando chega ao alvo: no máximo um aviso a cada 3 dias, salvo nova
  queda de 5%.
- `/api/cron/resumo-semanal`: toda segunda às 11:00 UTC. Gastos da semana
  anterior, o que é só da pessoa e o saldo do acerto.

No plano Hobby da Vercel, cada tarefa roda no máximo uma vez por dia e pode
disparar em qualquer momento dentro da hora marcada. Rodar a tarefa de novo
no mesmo dia (ou semana) não repete buscas nem e-mails.

## Executar localmente

```bash
npm ci
npm run dev
```

Abra http://localhost:3000. Sem as variáveis do Supabase, o painel abre em
desenvolvimento sem login e sem sincronização.

## Verificação

```bash
npm test          # Vitest: regras de negócio e migrations (PGlite)
npm run lint      # ESLint
npm run build     # valida o ambiente, compila e confere os tipos
npm run test:e2e  # Playwright: fluxos de tela (~1 min)
```

`npm run test:e2e` usa o Microsoft Edge instalado (não baixa navegadores) e
sobe `next dev` na porta 3200 sem Supabase, com as Server Actions cortadas
(modo local/offline). Cobre o importador de fatura, o "Desfazer" e o selo de
sincronização. O limite de 100 ms da fase 1 do importador é medido com o React
de produção, num pacote só do importador (`importador-producao.spec.ts`).

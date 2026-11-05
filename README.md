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
- Vitest (regras de negócio puras)

Tipografia: Playfair Display nos títulos e Manrope no corpo. Temas Claro e
Escuro com tokens CSS em `src/app/globals.css`.

## Funcionalidades

- **Buscar Passagens e Hospedagem**: links pré-preenchidos para os parceiros
  (`src/lib/deep-links.ts`) e, com as chaves configuradas, preços pela Kiwi.com
  (voos) e pela Booking.com via RapidAPI (hospedagem), com cota por usuário.
- **DuoFinance**: importação de fatura de cartão (CSV, TXT ou texto colado)
  que separa à vista e parcelado, limpa o nome das lojas, categoriza (Gemini ou
  catálogo local) e sugere o que é da viagem; compras já lançadas não são
  salvas de novo. Também lê recibos e comprovantes Pix com IA (sempre com
  confirmação) e aceita lançamento manual em qualquer moeda.
- **Acerto de Contas**: 50/50, proporcional à renda (ex.: 60/40) ou valor
  fixo, com Pix Copia e Cola (BR Code EMV).
- **Roteiro, Checklist, Alertas de Preço e Documentos**: sincronizados entre
  o casal (Realtime), com o que é pessoal visível só para quem lançou.
  Números de documentos são cifrados (AES-256-GCM).
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
  lib/
    auth/                   sessão verificada (getClaims) e validação (zod)
    sync/                   motor de sincronização, fila offline e modelos
    finance/                importação, analisador de fatura, acerto, resumo
    cambio/                 cotações e VET
    email/ mail.ts          modelos de e-mail e envio pela Resend
    cron/ alertas/          tarefas agendadas e regra de aviso dos alertas
    seguranca/              cotas por usuário e cifra de documentos
    supabase/               clientes (navegador, servidor, admin só p/ cron)
supabase/migrations/        SQL versionado (aplicar no SQL Editor, em ordem)
public/sw.js                Service Worker
vercel.json                 agenda das tarefas (cron)
```

## Variáveis de ambiente

Copie `.env.example` para `.env.local` (ignorado pelo Git). Na Vercel,
cadastre as mesmas variáveis em Settings → Environment Variables.

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

No Supabase → Authentication: confirmação de e-mail ligada, Site URL e
Redirect URL `https://<seu-domínio>/auth/callback`, e proteção contra senhas
vazadas.

## Publicar (ordem segura)

1. Aplicar as migrations 2 e 3 (são aditivas: a versão em produção continua
   funcionando com elas).
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
npm test        # Vitest (regras de negócio)
npm run lint    # ESLint
npm run build   # compila e valida os tipos
```

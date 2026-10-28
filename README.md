# PlannerDuo

App **pessoal e 100% gratuito** de planejamento de viagens a dois, construído em **Next.js (App Router)** + **TypeScript** + **Tailwind CSS v4**. Uso estritamente não corporativo. Interface 100% em **Português Brasileiro (PT-BR)**.

Repositório: `Tiago-D-Nocce-TechBiz/PlannerDuo.0`.

## Stack

- Next.js 16 (App Router, Server Components + Server Actions)
- React 19
- Tailwind CSS v4
- lucide-react (ícones)
- @supabase/supabase-js (persistência de buscas)

## Identidade visual — Degradê rico + Glassmorphism + Temas Claro/Escuro

Sistema de temas Claro e Escuro com alternância (Sol/Lua) no Header e na navbar pública. A preferência persiste em `localStorage` e é aplicada antes da hidratação (sem flash).

**Modo Claro** — degradê radial de `#FAF8F5` (branco profundo), `#F3E9DC` (champanhe), `#E4ECE9` (sálvia) e `#EFE4DF` (rosé).
**Modo Escuro** — degradê de `#0B0F17` (azul meia-noite), `#131822` (grafite) e reflexos `#1E293B`/`#2A2421`; cards em `bg-white/[0.04]` + `backdrop-blur`.

Superfícies glass via utilitários `.glass-surface` e `.glass-panel` (adaptam-se ao tema). Cores expostas como tokens Tailwind (`bg-accent-ink`, `text-heading`, `border-sand-border`, `text-leather`, etc.) definidos em `globals.css` com `@theme`, variando por `:root` / `.dark`.

Tipografia editorial: **serif** (Cormorant Garamond) nos títulos, **sans** (Plus Jakarta Sans) na UI, **mono** (JetBrains Mono) em dados numéricos.

## Estrutura

```
src/
  app/
    page.tsx                      # Landing Page (glassmorphism avançado)
    termos/page.tsx               # Termos de Uso + LGPD (público)
    (auth)/
      layout.tsx                  # Layout de auth (glass + toggle de tema)
      actions.ts                  # Server Actions base de login/registro
      login/page.tsx · registo/page.tsx
    dashboard/
      layout.tsx                  # Shell (Sidebar + Header)
      page.tsx                    # Visão geral (atalhos: Viagem/Hospedagem)
      buscar-viagem/page.tsx      # Motor de busca de voos
      buscar-hospedagem/page.tsx  # Motor de busca de hospedagens
      busca/page.tsx              # Redirect legado -> buscar-viagem
      roteiro/page.tsx
      financas/page.tsx · actions.ts
      configuracoes/page.tsx
      termos/page.tsx             # Termos de Uso + LGPD (no painel)
  components/
    theme/                        # ThemeProvider + ThemeToggle (Sol/Lua)
    ui/                           # Button, Field, Logo, Container, Modal
    marketing/                    # Seções da Landing (navbar flutuante, hero, ...)
    dashboard/                    # Sidebar, Header, Shell, LogoutLogo, nav-items
    search/                       # FlightSearch, StaySearch
    financas/                     # ReceiptScanner
    legal/                        # TermsContent (Termos + LGPD compartilhado)
  lib/
    utils.ts                      # cn(), formatação de data/moeda (R$)
    deep-links.ts                 # buildFlightLinks / buildStayLinks
    supabase/
      client.ts                   # cliente do browser (degrada se sem env)
      searches.ts                 # saveSearch() -> tabela `viagens`
supabase/
  schema.sql                      # tabelas `viagens` e `despesas` + RLS
```

## Funcionalidades nucleares

### Dois motores de busca (Deep Linking Outbound)

O PlannerDuo **não** faz pesquisa interna. A partir dos dados informados, gera
links pré-preenchidos que abrem numa nova aba as páginas de resultados dos
parceiros, e **salva a busca no Supabase** (tabela `viagens`).

- **Buscar Viagem** (`/dashboard/buscar-viagem`, ícone de avião): origem/destino
  (cidade + IATA), ida, volta, passageiros e classe → LATAM, Azul, GOL, Google
  Flights e Skyscanner.
- **Buscar Hospedagem** (`/dashboard/buscar-hospedagem`, ícone de hotel):
  cidade/destino, check-in, check-out, hóspedes e quartos → Airbnb, Booking.com,
  Hoteis.com e Trivago.

A construção das URLs está centralizada em `src/lib/deep-links.ts` — ponto único
de manutenção caso os parceiros alterem seus formatos de query string.

### Finanças Duo + IA (preparação)

Botões **"Escanear Nota ou Recibo"** (primário) e **"+ Lançamento manual"**
(secundário), com a Server Action base `scanReceiptAction`, onde o LLM de visão
(OCR) e a persistência no banco serão ligados futuramente. Valores em Real (R$).

### Termos de Uso & LGPD

Página jurídica em PT-BR (pública em `/termos` e no painel em
`/dashboard/termos`), cobrindo a natureza de agregador/redirecionador e uma
seção dedicada à LGPD (Lei nº 13.709/2018): dados coletados, finalidade e base
legal, direitos do titular (Art. 18), armazenamento no Supabase e canal do
Controlador/Encarregado (DPO). Link no rodapé da Sidebar e no footer público.

## Configuração do Supabase

1. Crie um projeto no Supabase e rode `supabase/schema.sql` no SQL Editor.
2. Preencha `.env.local` (ignorado pelo Git):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # ou NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Sem essas variáveis, a UI funciona normalmente e a persistência degrada
graciosamente (a busca é gerada, apenas não é salva).

## Executar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000.

## Verificação

```bash
npm run build   # compila e valida tipos
npm run lint    # ESLint
```

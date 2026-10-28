# PlannerDuo

App **pessoal e 100% gratuito** de planejamento de viagens a dois, construído em **Next.js (App Router)** + **TypeScript** + **Tailwind CSS v4**. Uso estritamente não corporativo. Interface 100% em **Português Brasileiro (PT-BR)**.

Repositório: `Tiago-D-Nocce-TechBiz/PlannerDuo.0`.

## Stack

- Next.js 16 (App Router, Server Components + Server Actions)
- React 19
- Tailwind CSS v4
- lucide-react (ícones)

## Identidade visual — Editorial (Warm Alabaster & Sand + Glassmorphism)

Tema claro editorial com superfícies de vidro (glassmorphism), sem Dark Mode.

| Token | Valor | Uso |
| --- | --- | --- |
| Fundo principal | `#FAF8F5` (Alabaster) + gradientes de areia `#F3EFE6`/`#EAE3D2` | corpo da aplicação |
| Superfícies glass | `bg-white/65` + `backdrop-blur-xl` + `ring-[#E6E0D4]/70` | Sidebar, Header, cards |
| Inputs | `bg-white/85`, borda `#DCD5C7`, foco `#8C7A6B` | formulários |
| Ação primária / item ativo | Espresso `#1C1917` / hover `#292524`, texto `#FAF8F5` | botões principais |
| Ação secundária / badge | Bege areia `#EFECE6` / `#E6E1D6`, borda `#DFD9CE` | botões secundários |
| Títulos | `#1C1917` | headings |
| Texto base | `#57534E` | corpo/UI |

Tipografia editorial: **serif** (Cormorant Garamond) nos títulos, **sans** (Plus Jakarta Sans) na UI, **mono** (JetBrains Mono) em dados numéricos.

## Estrutura

```
src/
  app/
    page.tsx                  # Landing Page
    (auth)/
      layout.tsx              # Layout centralizado de auth (glass)
      actions.ts              # Server Actions base de login/registro
      login/page.tsx          # Entrar
      registo/page.tsx        # Criar conta
    dashboard/
      layout.tsx              # Shell autenticado (Sidebar + Header)
      page.tsx                # Visão geral
      busca/page.tsx          # Motor de busca (deep linking)
      roteiro/page.tsx        # Roteiro
      financas/
        page.tsx              # Finanças Duo
        actions.ts            # Server Action base p/ OCR de notas (IA)
      configuracoes/page.tsx  # Configurações
  components/
    ui/                       # Button, Field, Logo, Container
    marketing/                # Seções da Landing Page
    dashboard/                # Sidebar, Header, Shell, PageHeading
    search/                   # SearchEngine (deep linking outbound)
    financas/                 # ReceiptScanner (botão "Escanear Nota ou Recibo")
  lib/
    utils.ts                  # cn(), formatação de data/moeda (R$)
    deep-links.ts             # Geração de URLs para Airbnb, Booking, LATAM, Azul, GOL
```

## Funcionalidades nucleares

### Motor de busca (Deep Linking Outbound)

O PlannerDuo **não** faz pesquisa interna. A partir de origem, destino e datas,
gera links pré-preenchidos que abrem numa nova aba as páginas de resultados
de **Airbnb**, **Booking**, **LATAM**, **Azul** e **GOL**. A construção das URLs
está centralizada em `src/lib/deep-links.ts` — ponto único de manutenção caso os
parceiros alterem seus formatos de query string.

> Nota: hospedagens usam o nome da cidade de destino; voos usam códigos IATA
> (ex.: `CNF`, `GIG`).

### Finanças Duo + IA (preparação)

A seção Finanças tem o botão **"Escanear Nota ou Recibo"** (ação primária) e
**"+ Lançamento manual"** (secundária), com a Server Action base
`scanReceiptAction` (em `dashboard/financas/actions.ts`), onde o LLM de visão
(OCR) e a persistência no banco de dados serão ligados futuramente. Os
placeholders e o contrato de dados (`ScannedReceipt`, com `establishment`) já
estão definidos. Valores exibidos em Real (R$).

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

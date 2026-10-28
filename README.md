# PlannerDuo

Aplicação **pessoal e 100% gratuita** de planeamento de viagens a dois, construída em **Next.js (App Router)** + **TypeScript** + **Tailwind CSS v4**. Uso estritamente não corporativo.

Repositório: `Tiago-D-Nocce-TechBiz/PlannerDuo.0`.

## Stack

- Next.js 16 (App Router, Server Components + Server Actions)
- React 19
- Tailwind CSS v4
- lucide-react (ícones)

## Identidade visual

Dark Mode integral, sem temas claros.

| Token | Valor | Uso |
| --- | --- | --- |
| Fundo principal | `bg-zinc-950` | corpo da aplicação |
| Cartões | `bg-zinc-900` | superfícies/cards |
| Bordas | `border-zinc-800` | contornos subtis |
| Texto base | `text-zinc-300` | corpo |
| Destaque | `#FCEB88` (Amarelo Pastel) + texto preto | **apenas** ações principais |

Tipografia híbrida: **serif** (Playfair Display) nos títulos, **sans** (Inter) no corpo, **mono** (JetBrains Mono) em dados numéricos.

## Estrutura

```
src/
  app/
    page.tsx                  # Landing Page
    (auth)/
      layout.tsx              # Layout centralizado de auth
      actions.ts              # Server Actions base de login/registo
      login/page.tsx          # Início de sessão
      registo/page.tsx        # Registo
    dashboard/
      layout.tsx              # Shell autenticado (Sidebar + Header)
      page.tsx                # Visão geral
      busca/page.tsx          # Motor de busca (deep linking)
      roteiro/page.tsx        # Roteiro
      financas/
        page.tsx              # Finanças Duo
        actions.ts            # Server Action base p/ OCR de recibos (IA)
      definicoes/page.tsx     # Definições
  components/
    ui/                       # Button, Field, Logo, Container
    marketing/                # Secções da Landing Page
    dashboard/                # Sidebar, Header, Shell, PageHeading
    search/                   # SearchEngine (deep linking outbound)
    financas/                 # ReceiptScanner (botão "Digitalizar Recibo com IA")
  lib/
    utils.ts                  # cn(), formatação de data/moeda
    deep-links.ts             # Geração de URLs para Airbnb, Booking, LATAM, Azul, GOL
```

## Funcionalidades nucleares

### Motor de busca (Deep Linking Outbound)

O PlannerDuo **não** faz pesquisa interna. A partir de origem, destino e datas,
gera links pré-preenchidos que abrem num novo separador as páginas de resultados
de **Airbnb**, **Booking**, **LATAM**, **Azul** e **GOL**. A construção dos URLs
está centralizada em `src/lib/deep-links.ts` — ponto único de manutenção caso os
parceiros alterem os seus formatos de query string.

> Nota: estadias usam o nome da cidade de destino; voos usam códigos IATA
> (ex.: `LIS`, `GIG`).

### Finanças Duo + IA (preparação)

A secção Finanças tem o botão **"Digitalizar Recibo com IA"** e a Server Action
base `scanReceiptAction` (em `dashboard/financas/actions.ts`), onde o LLM de
visão (OCR) e a persistência em base de dados serão ligados futuramente. Os
placeholders e o contrato de dados (`ScannedReceipt`) já estão definidos.

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

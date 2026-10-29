# PlannerDuo — Relatório de Auditoria Geral

Auditoria conduzida pelos três agentes especialistas sobre o estado atual do
repositório, com as correções aplicadas nesta rodada.

## 1. Front-End & UI/UX (`agent-frontend-ux`)
- Landing Page: **conforme**. Sem coordenadas, avisos flutuantes ou "Diário &
  Cartografia". CTAs levam a `/login`; não há cards de bypass para o painel.
- Logo original aplicada em todas as páginas; tipografia editorial; tokens de
  tema (Claro/Escuro) consistentes.
- Avião 3D decorativo com `ssr:false` + fallback 2D.

## 2. Back-End, Buscas & Dados (`agent-backend-data`)
- **Falha crítica corrigida — "This page couldn't load"**: era hydration
  mismatch causado por leitura de `localStorage` no inicializador de `useState`
  em `buscar-viagem/page.tsx` e `stay-search.tsx`. A leitura foi movida para
  `useEffect` (pós-montagem), deixando o HTML do servidor e do cliente iguais.
- Motores de busca e Supabase degradam graciosamente (sem crash) quando as
  chaves de API/env não estão presentes.
- Repositório limpo: `.tmp-e2e` (node_modules do Puppeteer) saiu do
  versionamento e entrou no `.gitignore`.

## 3. Segurança, Auth & LGPD (`agent-security-lgpd`)
- **Route guard endurecido (fail-closed)**: sem as variáveis do Supabase, o
  `proxy.ts` agora bloqueia `/dashboard/*` em produção (redireciona ao login),
  em vez de liberar silenciosamente.
- LGPD/Finanças: separação `pessoal_privado` × `viagem_compartilhado` correta na
  UI e coerente com a RLS `despesas_escopo`. Sem vazamento.
- Modal de saída na logo e Termos & LGPD presentes.

## Pendências que dependem do mantenedor
1. Configurar no projeto Vercel as variáveis `NEXT_PUBLIC_SUPABASE_URL` e
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` e aplicar `supabase/schema.sql` em produção —
   necessário para o Auth real, o route guard pleno e a sincronização entre as
   duas contas da dupla.
2. Avaliar Git LFS para `public/models/aviao.glb` (~1,9 MB) se o histórico
   crescer.

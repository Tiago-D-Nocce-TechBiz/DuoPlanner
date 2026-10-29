---
inclusion: always
---

# PlannerDuo — Metodologia de Agentes e Skills

Este documento codifica, em diretrizes próprias (escritas para o PlannerDuo),
as práticas inspiradas em bibliotecas públicas de *skills* de engenharia de
agentes e design. Ele NÃO reproduz o conteúdo dessas bibliotecas — resume os
princípios e aponta as fontes para consulta pelo mantenedor.

## Fontes de referência (consulta externa, não embutidas)

- skill-creator (anthropics/skills) — como estruturar skills reutilizáveis.
- agent-skills-for-context-engineering (muratcankoylan) — engenharia de contexto.
- superpowers (obra) — fluxos de trabalho de agentes.
- massgen (massgen) — orquestração multiagente.
- frontend-design, theme-factory, canvas-design, algorithmic-art,
  web-artifacts-builder (anthropics/skills) — design e artefatos web.

> Estas são referências metodológicas. O código e as diretrizes aqui são
> originais do projeto; nada é copiado literalmente das fontes.

## Princípios de engenharia de contexto aplicados ao PlannerDuo

1. **Investigar antes de alterar.** Ler o código real e mapear dependências
   antes de refatorar. Preferir diagnóstico com arquivo+linha a suposição.
2. **Degradação graciosa.** Toda dependência externa (Supabase, APIs de viagem,
   WebGL, IA) deve degradar com mensagem clara em PT-BR — nunca derrubar a
   página. Fronteiras: `ErrorBoundary`, `Suspense`, parse defensivo de JSON.
3. **Sem hydration mismatch.** Nunca ler `localStorage`/`window` no
   inicializador de `useState`. Leituras dependentes do cliente vão em
   `useEffect` após a montagem.
4. **Fail-closed em segurança.** Na dúvida sobre autenticação, bloquear o
   acesso ao painel, não liberar.
5. **Verificar com `npm run build`.** Nenhuma entrega sem build, lint e
   type-check limpos.

## Padrões de design (UI/UX)

- Glassmorphism com tokens de tema (variáveis CSS), consistente em Claro e
  Escuro; sem quebra de contraste.
- Menos poluição visual: foco no essencial de cada tela.
- Tipografia editorial (serif em títulos, sans no corpo).
- Logo e ícones originais (nunca reproduzir marcas de terceiros).

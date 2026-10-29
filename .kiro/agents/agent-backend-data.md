# Agente — Back-End, Motores de Busca & Banco de Dados (`agent-backend-data`)

Agente especialista em integração de dados, motores de busca e Supabase.

## Base de conhecimento (metodologias de referência)
superpowers · massgen · agent-skills-for-context-engineering. (Ver
`.kiro/steering/metodologia-agentes.md`.)

## Foco de análise e ação
- Diagnosticar e corrigir falhas de carregamento dos motores de Buscar
  Passagens (voos + ônibus) e Buscar Hospedagem.
- Auditar integração com Supabase (viagens, despesas, roteiro_itens,
  workspaces, convites, preferencias_duo, memoria_ia) sem quebrar render.
- Auditar o Concierge de buscas e o parser de faturas (CSV/Texto/NF).
- Manter o repositório limpo de artefatos temporários pesados (`.tmp-e2e`).

## Checklist de auditoria
- [ ] Nenhuma leitura de `localStorage`/`window` no inicializador de `useState`
      (causa hydration mismatch → "This page couldn't load").
- [ ] Rotas `/api/*` retornam JSON estruturado mesmo sem chave de API
      (degradam, não lançam).
- [ ] Parse de resposta é defensivo (`res.text()` + `JSON.parse` em try/catch).
- [ ] Nenhum componente consulta tabela inexistente (ex.: `configuracoes`).
- [ ] `.tmp-e2e` e `node_modules` fora do versionamento.

## Diagnóstico atual (auditoria desta rodada)
- **Causa do "This page couldn't load"**: leitura de `localStorage` no
  inicializador de `useState` em `buscar-viagem/page.tsx` e `stay-search.tsx`,
  gerando divergência servidor/cliente (hydration mismatch). **Corrigido**:
  leitura movida para `useEffect` pós-montagem.
- Supabase e APIs de viagem degradam corretamente (não lançam sem env).
- `.tmp-e2e` estava versionado (node_modules do Puppeteer). **Corrigido**:
  adicionado ao `.gitignore` e removido do índice (`git rm --cached`).

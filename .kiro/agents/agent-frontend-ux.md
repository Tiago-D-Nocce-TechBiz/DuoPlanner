# Agente — Front-End & UI/UX (`agent-frontend-ux`)

Agente especialista em interface, experiência e identidade visual do PlannerDuo.

## Base de conhecimento (metodologias de referência)
frontend-design · theme-factory · canvas-design · algorithmic-art ·
web-artifacts-builder. (Referências metodológicas — ver
`.kiro/steering/metodologia-agentes.md`.)

## Foco de análise e ação
- Eliminar excesso de informação visual; navegação limpa, intuitiva e direta.
- Landing Page focada na apresentação do produto + animação fluida do avião,
  sem coordenadas, avisos flutuantes, rótulos de "Diário & Cartografia" ou
  cards que abram o sistema sem login.
- Consistência absoluta Claro/Escuro em Glassmorphism (Tailwind v4), sem quebra
  de contraste nem sobreposição de cabeçalhos.
- Logo e ícones originais; tipografia editorial.

## Checklist de auditoria
- [ ] Nenhum texto de coordenadas/avisos flutuantes na landing.
- [ ] CTAs públicos levam a `/login`, nunca direto a `/dashboard`.
- [ ] Tokens de tema usados (sem cores hardcoded que quebrem no dark).
- [ ] Cabeçalhos `sticky` sem sobrepor conteúdo (padding-top do hero).
- [ ] Componentes 3D/pesados com fallback e `ssr:false`.

## Diagnóstico atual (auditoria desta rodada)
A landing já está limpa (sem coordenadas, sem cards de bypass; CTAs → /login).
A logo é original e aplicada em todas as páginas. Status: **conforme**.

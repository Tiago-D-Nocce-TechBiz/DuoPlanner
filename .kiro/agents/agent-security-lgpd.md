# Agente — Segurança, Autenticação & Privacidade LGPD (`agent-security-lgpd`)

Agente especialista em controle de acesso, pareamento de contas e privacidade.

## Base de conhecimento (metodologias de referência)
superpowers · agent-skills-for-context-engineering. (Ver
`.kiro/steering/metodologia-agentes.md`.)

## Foco de análise e ação
- Route guard: bloquear `/dashboard/*` sem sessão válida, redirecionando a
  `/login` (fail-closed).
- Pareamento por convite: isolar dados por `workspace_id` (sem vazamento entre
  espaços diferentes).
- LGPD/Finanças: itens `pessoal_privado` jamais na visão compartilhada; só
  `viagem_compartilhado` é exposto ao parceiro(a).
- Modal de confirmação de saída na logo e página de Termos & LGPD.

## Checklist de auditoria
- [ ] `proxy.ts` protege `/dashboard/:path*` e é fail-closed sem env.
- [ ] RLS: `despesas_escopo` só expõe `viagem_compartilhado` ao workspace;
      `pessoal_privado` restrito ao `user_id`.
- [ ] Convites não vazam dados entre workspaces.
- [ ] Separação de escopo garantida também na UI (listas e totais).

## Diagnóstico atual (auditoria desta rodada)
- **Furo do route guard**: sem env do Supabase o proxy deixava passar. 
  **Corrigido**: fail-closed em produção (redireciona ao login); só libera em
  `NODE_ENV !== production` para desenvolvimento local.
- **LGPD/Finanças**: separação correta na UI (listas/totais por escopo; default
  seguro = `pessoal_privado`). RLS `despesas_escopo` coerente no schema. Sem
  vazamento. Status: **conforme**.
- Modal de saída na logo e Termos & LGPD: presentes e conformes.

## Pendência conhecida (requer ação do mantenedor)
A sincronização real entre as duas contas e o bloqueio pleno dependem de o
Supabase Auth estar ligado em produção (variáveis `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_ANON_KEY` na Vercel + schema aplicado). Com o fail-closed,
o painel fica protegido mesmo nesse estado.

# PlannerDuo — Roadmap por Fases

Para reduzir risco, o desenvolvimento é separado em fases. Enquanto a **Fase
Front** não é concluída e aprovada, não mexemos em back-end/segurança (e
vice-versa), evitando afetar ambas ao mesmo tempo.

## Fase Front (em andamento)
Objetivo: todas as telas e funcionalidades de interface prontas, usáveis e
polidas, com dados no navegador (localStorage) onde ainda não há back.

Funcionalidades entregues/novas:
- Visão geral com Concierge (passagens/hospedagem) + ferramentas de acesso
  rápido.
- Buscar Passagens (voos + ônibus) e Buscar Hospedagem.
- Roteiro (dias e atividades) — funcional e persistente.
- **Checklist de Viagem / Bagagem** (novo) — categorias, progresso, itens.
- **Documentos da Viagem** (novo) — cofre de referências (cofre local nesta fase).
- Finanças Duo (importar fatura/NF, triagem de privacidade, lançamento manual).
- **Acerto de Contas** (novo) — "quem deve a quem", divisão igual da dupla.
- **Conversor de Moedas** (novo) — taxas de referência editáveis.
- Configurações (persistência local).
- Menu lateral agrupado por seções (Planejar / Finanças / Conta).

Pesquisa de mercado que embasou as novas features (apps de viagem+finanças a
dois/grupo): checklist/bagagem, cofre de documentos, acerto de contas/divisão,
conversor de moedas e visão de viagem são recorrentes nos líderes do segmento.
Conteúdo das fontes foi apenas consultado e parafraseado, não copiado.

## Fase Back & Segurança (próxima — só após o front aprovado)
- Ligar Supabase Auth de ponta a ponta (login/sessão reais).
- Persistir Roteiro, Checklist, Documentos, Finanças e Acerto no Supabase,
  sincronizando entre as duas contas por `workspace_id`.
- Cotação de moedas ao vivo (API) no Conversor.
- Endurecer RLS para produção; auditoria de privacidade (LGPD).
- OCR de faturas/recibos por IA.

## Regra de ouro
Nenhuma entrega sem `npm run build`, lint e type-check limpos.

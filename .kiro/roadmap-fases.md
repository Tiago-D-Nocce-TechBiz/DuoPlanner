# DuoPlanner — Roadmap de execução (produção)

Não existe ambiente UAT: todo push em `main` vai direto para produção
(Vercel, conta Tiago-D-Nocce-TechBiz). Por isso cada entrega segue:

1. Teste automatizado reproduzindo o defeito antes da correção (`npm test`).
2. `npm test`, `npm run lint` e `npm run build` limpos antes do push.
3. Mudanças de banco são **aditivas** (expandir antes de contrair): o código
   novo funciona antes e depois de o SQL ser aplicado no Supabase.
4. SQL é aplicado manualmente no SQL Editor do Supabase (não há CLI/senha do
   banco neste ambiente). O código detecta tabela ausente e degrada.

Origem dos itens: revisão técnica de 01/11/2026 (testes T1–T6).

## Fase 1 — Correções só de código (sem dependência de banco)
- [x] 1.1 Infra de testes (Vitest) + regressões dos testes T1–T4
- [x] 1.2 Importação de fatura: decimal com ponto, 3 e 4 colunas, aspas,
      pagamento/estorno ignorado, data preservada; excluir lançamento
- [x] 1.3 Classificador por palavra inteira, "na dúvida, privado"
- [x] 1.4 Nora: valor só com padrão monetário; escrita vira proposta com
      Confirmar; resposta pendente cancelada em "Nova conversa" e ao
      desmontar (fechar o painel mantém a resposta)
- [x] 1.5 Datas: dd/mm já passado vai para o próximo ano; volta antes da ida;
      "08 a 15/07"; destino só com cidade conhecida no último recurso
- [x] 1.6 Textos honestos (provedores de ônibus, companhias aéreas, Hoteis.com,
      "sincroniza", leitura de recibos, onde os dados ficam nos Termos; o "+"
      da Nora abre Finanças em vez de fingir que importou)
- [x] 1.7 Ternário duplicado no Google Flights (tt:o só para só ida)
- [x] 1.8 Avatar da Nora: um listener compartilhado + rAF, avatar fora da tela
      é pulado, piscada só em CSS, respeita "reduzir movimento"

## Fase 2 — Sessão, convite e segurança
- [ ] 2.1 `createBrowserClient` (@supabase/ssr) no lugar do `createClient`
- [ ] 2.2 Buscas salvas pelo servidor com `user_id`/`workspace_id`
- [ ] 2.3 Convite: erro explícito em vez de código falso; código guardado no
      cadastro e aplicado após confirmar o e-mail; `?redirect` respeitado
- [ ] 2.4 Workspace ativo determinístico
- [ ] 2.5 `/api/flights` e `/api/hotels` exigem sessão
- [ ] 2.6 SQL: RPC `aceitar_convite` + RLS sem `user_id is null` (mesmo deploy
      do código que usa a RPC)

## Fase 3 — Dados multiusuário no Postgres (sair do localStorage)
- [ ] 3.1 SQL aditivo: tabelas novas + colunas novas em `despesas` + RLS
- [ ] 3.2 Camada de dados no servidor (Server Actions + zod)
- [ ] 3.3 Finanças/Acerto como livro-razão (`pago_por`)
- [ ] 3.4 Roteiro, checklist, documentos, alertas, configurações
- [ ] 3.5 Importação única do que existe no navegador + limpeza no logout
- [ ] 3.6 Notificações reais (trigger + Realtime)

## Fase 4 — Produto
- [ ] 4.1 Nora com LLM gratuito em camadas (Gemini Flash-Lite → gpt-oss/Groq →
      motor local), confirmação de escrita, manual do sistema, cota por usuário
- [ ] 4.2 Câmbio ao vivo (AwesomeAPI + cache) no Conversor
- [ ] 4.3 Aeroportos por dados abertos + aeroporto mais próximo
- [ ] 4.4 Desempenho (logo, 3D sob demanda) e remoção de código morto
      (apagar arquivos exige aprovação do Tiago)
- [ ] 4.5 Keep-alive do Supabase gratuito

## Regra de ouro
Nenhuma entrega sem `npm test`, `npm run lint` e `npm run build` limpos.

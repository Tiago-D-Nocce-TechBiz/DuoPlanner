# DuoPlanner — Roadmap de execução (produção)

Não existe ambiente UAT: todo push em `main` vai direto para produção
(Vercel, conta Tiago-D-Nocce-TechBiz). Por isso cada entrega segue:

1. Teste automatizado reproduzindo o defeito antes da correção (`npm test`).
2. `npm test`, `npm run lint` e `npm run build` limpos antes do push.
3. Mudanças de banco são **aditivas** (expandir antes de contrair): o código
   novo funciona antes e depois de o SQL ser aplicado no Supabase.
4. SQL é aplicado manualmente no SQL Editor do Supabase (não há CLI/senha do
   banco neste ambiente), na ordem de `supabase/migrations/`. O código detecta
   tabela ausente e degrada.

Origem dos itens: revisão técnica de 01/11/2026 (testes T1–T6) e o plano
"SaaS produção" de 04/11/2026 (Épicos 1 a 4, branch `feat/producao-saas`).
Ordem de publicação: README, seção "Publicar (ordem segura)".

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

## Fase 2 — Sessão, convite e segurança (Épico 1)
- [x] 2.1 `createBrowserClient` (@supabase/ssr) no lugar do `createClient`
- [x] 2.2 Buscas salvas pelo servidor com `user_id`/`workspace_id` (zod)
- [x] 2.3 Convite: erro explícito em vez de código falso; código guardado no
      cadastro (`user_metadata.convite_pendente`) e aplicado no 1º login;
      `/auth/callback` abre a sessão ao confirmar o e-mail; `?redirect`
      respeitado só para `/dashboard/...`
- [x] 2.4 Workspace ativo determinístico (convite aceito vence o espaço vazio)
- [x] 2.5 `/api/flights` e `/api/hotels` exigem sessão (401 JSON)
- [x] 2.6 Código: RPC `aceitar_convite` com caminho antigo enquanto a RPC
      não existe; Server Actions de volta ao limite de 1 MB
- [x] 2.7 Sessão verificada (`getClaims`) dentro de toda action e rota;
      cotas por usuário; aceite do convite por POST com confirmação; zod no
      login; cadastro sem enumeração de e-mail; logout limpa `pd-*`
- [ ] 2.6b SQL `supabase/migrations/20261104120000_endurecimento_seguranca.sql`
      (substitui `security-hardening.sql`) aplicado no SQL Editor + Redirect
      URL `/auth/callback` no Supabase Auth — aguardando o Tiago

## Fase 3 — Dados multiusuário no Postgres (Épico 2)
Código pronto na `feat/producao-saas`; falta aplicar
`20261104120100_sincronizacao_casal.sql` e publicar.
- [x] 3.1 SQL aditivo: tabelas novas (perfis, acordos, despesas_viagem,
      roteiro, checklist, alertas, documentos) + RLS + Realtime
- [x] 3.2 Camada de dados no servidor (Server Actions + zod) e fila offline
- [x] 3.3 Finanças/Acerto como livro-razão (`pago_por`): 50/50,
      proporcional e valor fixo; Pix Copia e Cola (BR Code EMV)
- [x] 3.4 Roteiro, checklist, documentos (cifrados), alertas, configurações
- [x] 3.5 Importação única do que existe no navegador + limpeza no logout
- [x] 3.6 Notificações do par via Realtime
- [x] 3.7 DuoFinance (importador de faturas) gravando em `despesas_viagem`
      com parcelas e categoria detalhada; compras já lançadas não duplicam

## Fase 4 — Produto
- [ ] 4.1 Nora com LLM gratuito em camadas (Gemini Flash-Lite → gpt-oss/Groq →
      motor local), confirmação de escrita, manual do sistema, cota por usuário
- [x] 4.2 Câmbio ao vivo (AwesomeAPI + cache de 1 h em `/api/cotacoes`) no
      Conversor, com referência offline e edição manual preservada
- [ ] 4.3 Aeroportos por dados abertos + aeroporto mais próximo
- [x] 4.4 Desempenho (logo WebP, 3D sob demanda) e remoção de código morto
- [ ] 4.5 Keep-alive do Supabase gratuito

## Fase 5 — PWA e e-mails (Épicos 3 e 4)
- [x] 5.1 PWA: manifesto, Service Worker, tela offline, indicador
      "Modo Offline — Sincronizando quando a conexão voltar" e convite de
      instalação (Android e iOS)
- [x] 5.2 E-mails pela Resend: queda de preço, convite e resumo semanal
- [x] 5.3 Cron diário dos alertas e cron semanal do resumo (`vercel.json`,
      Bearer `CRON_SECRET`)
- [x] 5.4 "Qual cartão usar?" (VET: cartão, conta global e espécie)
- [ ] 5.5 Variáveis na Vercel (`SUPABASE_SECRET_KEY`, `CRON_SECRET`,
      `RESEND_API_KEY`, `EMAIL_REMETENTE`, `DOCUMENTOS_CHAVE_CRIPTO`) e domínio
      verificado na Resend — aguardando o Tiago

## Fase 6 — Fluidez e confiabilidade (rodada de 12/11/2026)
Código pronto na `feat/producao-saas`; falta aplicar
`20261105120000_fingerprint_fatura.sql` e publicar.
- [x] 6.1 Ambiente validado com zod (`src/lib/env/`): valor malformado
      interrompe o build (`next.config.ts`) e o boot (`instrumentation.ts`);
      variável ausente deixa a integração em modo degradado
- [x] 6.2 Dinheiro em centavos inteiros (`src/lib/finance/money.ts`):
      `splitAmount` pelo maior resto (R$ 10,01 ÷ 2 = 5,01 + 5,00) em acerto,
      resumo, VET, alertas e importador
- [x] 6.3 `transaction_fingerprint` por pessoa: reimportar a fatura marca
      "Já importado anteriormente (Ignorado)"; índice único e gatilho de
      imutabilidade no banco
- [x] 6.4 `withAuthAction` em todas as Server Actions (`getClaims`, zod,
      `{ success, data, error, code }`, sem stack trace) e error boundaries
- [x] 6.5 Importador em duas fases: tabela local abaixo de 100 ms (React de
      produção, até 200 compras medidas), linhas longas montadas em levas, IA
      em lotes só para o que o catálogo não reconheceu
- [x] 6.6 "Desfazer" de 5 s (checklist, roteiro e gastos), `useOptimistic`
      em Documentos e na regra do Acerto, `SyncStatusBadge` no cabeçalho
- [x] 6.7 Bundle: Nora sob demanda, DuoFinance em ilhas, Supabase e zod fora
      do pacote inicial do navegador (rotas do painel 35% a 40% menores, gzip)
- [x] 6.8 Testes: migrations num Postgres em WASM (`tests/sql`) e fluxos de
      tela com Playwright (`npm run test:e2e`)
- [ ] 6.9 SQL `20261105120000_fingerprint_fatura.sql` aplicado no SQL Editor
      (depois da 3.x) — aguardando o Tiago

## Fase 7 — Desempenho ponta a ponta (rodada de 12–13/11/2026)
Código pronto na `feat/producao-saas`; falta aplicar
`20261112140000_indices_performance.sql` e publicar.
- [x] 7.1 Prazo em toda chamada externa (`fetchWithTimeout`, 8 s) e nos
      clientes do Supabase; erro de prazo vira mensagem em PT-BR
- [x] 7.2 Banco: sem `SELECT *`, leitura completa paginada por id (o corte
      silencioso de 1000 linhas do PostgREST sumiu), lotes em vez de consultas
      em laço (sincronização e crons), leituras independentes em paralelo
- [x] 7.3 Índices compostos (migration 6, só aditiva), testados no PGlite
- [x] 7.4 Experiências Ocultas em fluxo (`POST /api/experiencias`, NDJSON) e
      Nora palavra por palavra (1ª palavra em ~0,5 s; antes 1,4 a 3 s de espera)
- [x] 7.5 DuoFinance: 50 gastos por vez, busca sem acento com debounce de
      300 ms, abas montadas com `<Activity>`; linhas memoizadas no Roteiro e
      na lista (o motor mantém a referência do que não mudou)
- [x] 7.6 Altura reservada das linhas fora da tela medida por largura
      (`content-visibility`), cache imutável dos ícones/marca/3D, AVIF/WebP,
      `compress`, região `gru1`
- [x] 7.7 Observabilidade: aviso de chamada lenta (> 1,5 s, OpenTelemetry só
      no log) e Web Vitals em `/api/vitals`
- [x] 7.8 Celular lento nos testes: CPU 4x + Slow 4G (app completo) e React
      de produção com CPU 4x (interações do painel abaixo de 200 ms)
- [ ] 7.9 SQL `20261112140000_indices_performance.sql` aplicado no SQL Editor
      (depois da 6.9) — aguardando o Tiago
- [ ] 7.10 Confirmar que o projeto Supabase está em São Paulo (sa-east-1); se
      não, trocar `gru1` no `vercel.json`
- [ ] 7.11 Em produção, medir a IA contra o prazo de 8 s (recibos, lote de 40
      linhas da fatura) e, depois de semanas de uso, remover os índices
      redundantes que `pg_stat_user_indexes` mostrar sem uso

## Fase 8 — Nora Travel Hacks e Roteiro com planilha (rodada de 19/11/2026)
Código pronto na `feat/producao-saas`; falta aplicar
`20261119120000_roteiro_planilha.sql` e publicar.
- [x] 8.1 Nora Travel Hacks: 9 ferramentas (`/datas-baratas`,
      `/aeroportos-proximos`, `/conexoes-inteligentes`, `/auditar-voo`,
      `/verificar-taxas`, `/escolher-bairro`, `/comparar-hospedagem`,
      `/otimizar-roteiro`, `/veredito-reserva`) com chips e menu `/` na gaveta,
      card de análise (nota 1 a 10, veredito, taxas ocultas, "Salvar Dica no
      Roteiro", "Criar Alerta de Preço"). Contexto do casal automático (só
      gastos compartilhados), Gemini estruturado com prazo de 12 s, cota "ia"
      só quando a IA é chamada e lista de conferência local de reserva
- [x] 8.2 React Compiler removido (custava +1,8 a +17 KB gzip por rota sem
      ganho medido). Chunk da gaveta da Nora, gzip: 18.829 B na base
      (`5a2a96d`), 22.477 B com compilador e Nora, 18.122 B sem compilador e
      com os 9 comandos. JS total do app, gzip: 770.529 B (base) → 784.953 B
      (+14,4 KB: Nora, importador fase 1 e remoção do compilador). Nenhum prompt,
      schema de IA, LangChain nem chave em chunk de navegador (o zod do motor de
      sincronização já estava no pacote antes)
- [x] 8.3 Roteiro com planilha: página de servidor com ilhas cliente; modelo
      `DuoPlanner-Modelo-Roteiro.xlsx`; importação .xlsx/.csv (leitura no
      aparelho, `xlsx` 0.20.3 só sob demanda); prévia dia a dia; curadoria da
      Nora (classificação e sugestões com "Incluir no Roteiro"/"Ignorar") com
      fallback determinístico sem IA, sem cota e offline
- [x] 8.4 Impressão digital por atividade (`r1:` + SHA-256) com índice único por
      espaço: reimportar não duplica. Gravação em lote pela fila de
      sincronização (um insert por grupo). Mescla de espaços do convite
      descarta a cópia repetida (testado no PGlite)
- [x] 8.5 Roteiro agrupado por dia (data, destino, custo estimado do dia),
      filtros Praia/Passeio/Gastronomia/Transporte e "Desfazer" de 5 s
- [x] 8.6 Medição da rota `/dashboard/roteiro`: 14 chunks iniciais, 212.156 B
      gzip (Checklist, sem planilha: 210.467 B), sem `xlsx` nem zod; o `xlsx`
      (159.876 B gzip) e o diálogo de importação (11.915 B) só baixam no clique
- [ ] 8.7 SQL `20261119120000_roteiro_planilha.sql` aplicado no SQL Editor
      (depois da 7.9) — aguardando o Tiago
- [ ] 8.8 Em produção, medir o Gemini contra o prazo de 12 s (Nora Travel Hacks
      e curadoria do Roteiro) e a qualidade das sugestões (lugares reais)
## Fase 9 — Fechamento, Roteiro + Finanças e histórico de preços (rodada de 19/11/2026)
Código pronto na `feat/producao-saas`; falta aplicar
`20261120120000_historico_precos_alertas.sql` (e a 7, se ainda não) e publicar.
Passo a passo e consultas de conferência: README, "Aplicar as migrations 7 e 8".
- [x] 9.1 Lint com 0 avisos e teste de higiene do repositório (`.tmp-e2e/`,
      `.tmp-*/`, `node_modules` em qualquer nível e `.env*` ignorados e fora do Git)
- [x] 9.2 `npm run test:integracao`: Gemini real, opt-in (pulado sem
      `GEMINI_API_KEY`); testes offline provam o `AbortSignal.timeout(12000)`
      na Nora e na curadoria do Roteiro
- [x] 9.3 Ordem híbrida do Roteiro: calendário primeiro; mesma data ou sem
      data, ordem manual (subir e descer, para dias e atividades)
- [x] 9.4 Roteiro → DuoFinance: lançar atividade ou dia, com confirmação de
      escopo e valor; id determinístico, sem duplicar (sem migration)
- [x] 9.5 Alertas de Preço: histórico por alerta e dia (RLS por espaço, só o
      monitor grava, upsert em lote), gráfico e resumo sob demanda
- [ ] 9.6 SQL `20261120120000_historico_precos_alertas.sql` aplicado no SQL
      Editor (depois da 8.7) — aguardando o Tiago
- [ ] 9.7 Rodar `npm run test:integracao` com a chave real e medir a latência do
      Gemini contra os 12 s
## Regra de ouro
Nenhuma entrega sem `npm test`, `npm run lint` e `npm run build` limpos.

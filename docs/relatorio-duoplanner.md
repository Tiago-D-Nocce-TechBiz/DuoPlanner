# Relatório do DuoPlanner

Posição em 19/11/2026, branch `feat/producao-saas`, HEAD `3414b6a`. Os 4 últimos commits (`e53f2ed` a `3414b6a`) estavam só locais na data do relatório; o push ficou pendente. Os números vêm de contagens no repositório, de `npm test`, `tsc`, `lint`, `next build` e do e2e. Itens sem execução real estão marcados.

## 1. Repositório

| Item | Valor |
|---|---|
| Commits / período | 107, de 28/10 a 19/11/2026 |
| Arquivos rastreados | 372 (306 em `src/`) |
| Código de produção em `src/` | ~31,5 mil linhas |
| Código de teste | ~9,4 mil linhas |
| Testes | 748 unitários e SQL (71 arquivos), 10 specs e2e (47 testes), 1 arquivo de integração opt-in |
| Migrations | 8, todas aditivas e idempotentes |
| Rotas do painel | financas, acerto, roteiro, checklist, alertas, documentos, conversor, busca, configurações e outras |
| APIs | flights, hotels, experiencias, cotacoes, vitals, cron (alertas e resumo semanal) |
| Artefatos temporários rastreados | 0 (`.tmp-*/` e `node_modules/` ignorados, com teste que trava regressão) |

### Qualidade na última rodada

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | 0 erros |
| `npm run lint` | 0 erros, 0 avisos |
| `npm test` | 748 passando |
| `next build` | limpo |
| e2e | 46 passaram e 1 falhou (teste de tempo do importador, mediana 201 ms contra teto de 200 ms) |

- O teste do importador passou 3 de 3 rodando isolado. A falha foi logo após o build, com a máquina carregada. O teto não foi alterado.
- A mudança do código desde `5a2a96d` é de 91 arquivos, +9.087 e −565 linhas.

## 2. Funcionalidades em andamento (rodada atual)

### Nora Travel Hacks (`56ba2b5`)
- 9 ferramentas, acionadas por chip ou pelo comando `/`: datas baratas, aeroportos até 240 km, conexões, auditoria de voo (nota 1–10), taxas ocultas, top 3 bairros, hotel x Airbnb, corte de 20% e veredito (reserve, espere ou mude de plano).
- O contexto do casal vem do workspace. Só gastos compartilhados vão à IA.
- Usa Gemini estruturado com prazo de 12 s e cota por usuário. Sem chave, sem cota ou offline, mostra uma lista de conferência local.

### Roteiro com planilha (`a92b654`)
- Baixa o modelo `.xlsx`, importa `.xlsx` e `.csv`, e mostra prévia dia a dia.
- A Nora classifica o que está ambíguo e sugere praias, passeios e restaurantes dos destinos da planilha, cada um com o porquê.
- Cada atividade tem impressão digital com índice único por espaço, então reimportar não duplica.
- O conflito de convite (`23505`) é tratado na mescla de espaços.

### Roteiro e Finanças (`6815dd2`)
- Os dias seguem o calendário. Na mesma data, ou sem data, vale a ordem manual (subir e descer).
- "Lançar nas Finanças" envia uma atividade ou o dia inteiro, com confirmação de escopo e valor.
- O id do gasto é determinístico: reenvio, outro aparelho ou o par lançando de novo não duplica.

### Histórico de preços dos Alertas (`000e773`)
- O monitor diário grava uma série por alerta e dia, num único upsert por rodada.
- A tabela tem RLS por workspace, e só o monitor grava.
- A tela mostra um gráfico sob demanda, com menor preço visto, variação, tendência e dias no alvo.

### Já existente (base)
- DuoFinance com importação de fatura, Acerto com Pix, Alertas por e-mail, Documentos cifrados e PWA offline.
- Conversor de moedas e Experiências Ocultas.
- Sincronização em tempo real e fila offline.

## 3. Melhorias técnicas

### Desempenho
- Gaveta da Nora: 18.829 B gzip na base e 18.122 B hoje, já com os 9 comandos.
- React Compiler removido (custava +1,8 a +17 KB por rota, sem ganho medido).
- Importador de fatura reescrito: SHA-256 síncrono, dicionário indexado e 4 linhas na primeira pintura.
- JS total do app: 770.529 B na base e 784.953 B na rodada anterior (+14,4 KB). A soma não foi refeita depois das frentes de Roteiro e Alertas; só essas duas rotas foram medidas.
- Rota Roteiro: 218.268 B gzip. Rota Alertas: 219.951 B gzip.
- `xlsx` (159.876 B gzip, versão 0.20.3 do CDN oficial da SheetJS) e o diálogo de importação só baixam no clique.

### Arquitetura e segurança
- Roteiro e Alertas usam Server Component com ilhas cliente sob demanda.
- Sessão por `getClaims()` em toda Server Action. Colunas nomeadas, sem `SELECT *`.
- Zod, prompts e LangChain ficam só no servidor. Um teste percorre o grafo de imports e trava vazamentos.
- Nenhum prompt, schema de IA, LangChain ou chave aparece em chunk de navegador.
- Migrations testadas num Postgres em WASM, incluindo RLS, grants, CHECKs e reaplicação.

## 4. Riscos e pendências

| # | Pendência | Impacto |
|---|---|---|
| 1 | Push dos 4 commits não concluiu (Git Credential Manager). Rodar `git push origin feat/producao-saas`. | Trabalho só local |
| 2 | Aplicar as migrations 7 e 8 no SQL Editor (guia no README, com 7 consultas de conferência). | Sem elas, Roteiro em "modo local" e sem histórico de preços |
| 3 | Gemini real nunca foi executado (sem chave local). Rodar `npm run test:integracao`. | Qualidade das sugestões e latência de 12 s só foram simuladas |
| 4 | Variáveis de produção (`SUPABASE_SECRET_KEY`, `CRON_SECRET`, `RESEND_API_KEY` e outras) e domínio na Resend. | Cron de alertas e e-mails ficam degradados |
| 5 | Confirmar que o Supabase está em São Paulo (`gru1` no `vercel.json`). | Latência |
| 6 | Teste de tempo do importador no limite em máquina carregada. | Risco de falso negativo no CI |
| 7 | Sem baseline anterior para a rota Alertas. | Não dá para dizer se subiu de peso |

## 5. Próximos passos sugeridos

1. Concluir o push e aplicar as migrations 7 e 8, na ordem.
2. Rodar `npm run test:integracao` com a chave e registrar a latência.
3. Rodar o monitor de alertas à mão e conferir a primeira linha em `alertas_preco_historico`.
4. Escolher a próxima frente (Acerto de Contas ou PWA) sobre a mesma base.
5. Só então abrir o merge em `main`, que vai direto para produção.

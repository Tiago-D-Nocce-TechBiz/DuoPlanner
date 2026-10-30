# PlannerDuo — Ferramentas Externas Avaliadas

Registro de skills/ferramentas de terceiros avaliadas para o projeto. Nenhuma
é instalada automaticamente: instalação é ação consciente do mantenedor, com
análise de licença e dependências. Este arquivo serve de referência, não de
instalação.

> Limitação técnica: o agente não clona repositórios do GitHub nem baixa
> pacotes não publicados para dentro do projeto. Os comandos abaixo devem ser
> executados pelo mantenedor quando (e se) decidir adotar a ferramenta.

## Confirmadas como existentes e open-source

### 1. strix — `usestrix/strix` (Apache-2.0)
- O que é: agentes de IA de pentest que leem o código, rodam exploits reais e
  validam vulnerabilidades com prova de conceito. Integra com CI/CD.
- Pertinência ao PlannerDuo: **ALTA — mas só na Fase Back & Segurança.**
  Casa com o `agent-security-lgpd` (auditoria de segurança do painel, auth e
  LGPD). Não instalar durante a Fase Front.
- Risco: executa código dinamicamente contra o app; só rodar em ambiente
  controlado, nunca cegamente em produção. Requer chave de LLM.
- Como instalar (quando for a hora): seguir o guia oficial do repositório
  (`pipx install strix-agent` ou conforme o README atual) — validar antes.

### 2. OmniRoute — `diegosouzapw/OmniRoute` (MIT)
- O que é: gateway de IA OpenAI-compatível; roteia para muitos provedores,
  vários com tier gratuito; fallback automático.
- Pertinência ao PlannerDuo: **MÉDIA.** Útil se/quando ligarmos recursos de IA
  (ex.: OCR de recibos nas Finanças, Concierge com LLM real). Seria uma peça de
  infraestrutura externa, não código embutido no app.
- Risco: infraestrutura de terceiros no caminho de dados; avaliar privacidade
  (LGPD) antes de enviar qualquer dado financeiro a provedores externos.

### 3. i-have-adhd — `ayghri/i-have-adhd` (público)
- O que é: skill que molda o ESTILO de resposta do assistente de código (ação
  primeiro, passos numerados). É uma skill do assistente, não do aplicativo.
- Pertinência ao PlannerDuo: **BAIXA para o produto** (não vira funcionalidade
  do app). Pode ser usada como preferência pessoal do mantenedor no seu
  assistente, fora do repositório do produto.

## Não avaliadas / provavelmente fora de escopo
book-to-skill, open-notebook, ai-job-search, open-seo, Open-Generative-AI —
não têm relação com planejamento de viagens e finanças a dois. Não recomendadas
para este repositório.

## Decisão
- Fase Front (atual): **não instalar nada.** Apenas este registro.
- Fase Back & Segurança: avaliar `strix` para a auditoria e, se formos usar IA,
  considerar `OmniRoute` como gateway — ambos com análise de licença,
  dependências e privacidade antes de adotar.

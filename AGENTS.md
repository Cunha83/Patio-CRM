# Pátio-CRM — Instruções Canônicas para Agentes de IA (`AGENTS.md`)

Este repositório adota os padrões de **Harness Engineering** (`vibe-coding-gemini`) e **Superpowers** (`executing-plans`, `test-driven-development`, `verification-before-completion`, `finishing-a-development-branch`).

---

## 1. Arquitetura Modular de Domínios e Padrão Facade

Nenhum módulo individual do sistema deve ultrapassar o limite de **350 linhas**. Todos os domínios utilizam o padrão **Fachada (Facade / Re-export)** para garantir **Zero Quebra de Contratos Públicos** e total retrocompatibilidade:

### A. WhatsApp & Atendimento (`services/whatsapp/`)
- **Fachada Central:** `services/whatsapp/whatsappHandlers.js` (< 150 linhas).
- **Submódulos:** `services/whatsapp/handlers/`
  - `whatsappInboundHandler.js`: Roteamento e intake de mensagens e mídias.
  - `whatsappStatusHandler.js`: Consulta de status de OS e análise de documentos.
  - `whatsappMessageProcessor.js`: Processador de mensagens e parser de comandos.
  - `whatsappPendingConfirmations.js`: Resolução de confirmações em 2 etapas e auditoria.
  - `whatsappSecurity.js`: Rate limiting, idempotência e permissões de remetente.
  - `whatsappFinancialQueries.js`, `whatsappCashCommands.js`, `whatsappBICommands.js`, etc.

### B. Gestão Financeira Backend (`services/financial/`)
- **Fachada Central:** `services/financialAnalystService.js` (< 150 linhas).
- **Submódulos:** `services/financial/`
  - `cashRegisterService.js`: Abertura, fechamento e lançamentos de caixa diário.
  - `cashRegisterBoletimService.js`: Apuração de movimentações e boletim WhatsApp.
  - `financialAuditService.js`: Auditoria e conformidade contábil.
  - `financialForecastService.js`: Projeções de fluxo de caixa e aging.
  - `financialHelpers.js`: Normalização, arredondamento e helpers compartilhados.

### C. Motor Inteligente de Voz (`services/voice/`)
- **Fachada Central:** `services/voiceActionEngine.js` (< 150 linhas).
- **Submódulos:** `services/voice/`
  - `voiceActionDispatcher.js`: Roteamento e orquestração de ações de voz.
  - `voiceRulesInterpreter.js` e `voiceRulesPatterns*.js`: NLU determinístico por heurísticas.
  - `voiceAIInterpreter.js`: Fallback para LLM multimodal via `@google/genai`.
  - `voiceSecurity.js`: RBAC, tokens criptográficos e trilha de auditoria.
  - `voicePatioActions.js`, `voiceOpenOSAction.js`: Operações de pátio e boxes.
  - `voiceInventoryActions.js`: Almoxarifado e reservas de peças.
  - `voiceLaborActions.js`, `voiceLaborCostActions.js`: Apontamento, produtividade e custos.
  - `voicePricingActions.js`, `voiceProfitabilityActions.js`: Precificação, margem e rentabilidade.
  - `voiceFinancialActions.js`, `voiceCRMActions.js`, `voiceExecutiveActions.js`: Caixa, clientes e briefing.

### D. Frontend Financeiro (`js/modules/`)
- **Orquestrador Central:** `js/financeiro.js` (< 200 linhas) — mantém `viewFinanceiro()`, delegações e binds em `window`/`globalThis`.
- **Submódulos:** `js/modules/`
  - `financeiro_dashboard.js` & `financeiro_dashboard_calc.js`: KPIs e métricas.
  - `financeiro_graficos.js`: Renderização de séries e gráficos SVG/Canvas.
  - `financeiro_titulos.js`: Contas a pagar e receber, baixa e recibos.
  - `financeiro_caixa.js` & `financeiro_estorno.js`: Fluxo de caixa e estornos compensatórios.
  - `financeiro_dre.js`: DRE gerencial e fechamento.
  - `financeiro_pix_hub.js`: Hub Pix, QR Codes e régua de cobrança.

### E. Frontend Monday Work OS (`js/modules/`)
- `js/modules/monday_board.js`: Board moderno de pátio com grupos expansíveis, toolbar e status em pílulas.
- `js/modules/automations_modal.js`: Central de automações em linguagem natural (IF/THEN).

### F. Folhas de Estilo Modulares (`css/`)
- **Agregador Mestre:** `style.css` (< 30 linhas via `@import`).
- **Folhas Temáticas:** `css/variables.css`, `css/base-layout.css`, `css/components.css`, `css/voice-drawer.css`, `css/voice-modal.css`, `css/financeiro.css`, `css/dashboard-operacional.css`, `css/patio-monday.css`, `css/patio-monday-cells.css`, `css/enterprise-nav.css`, `css/automations-modal.css`, `css/responsive.css`.

---

## 2. Quality Gates e Harness de Verificação Ativos

Qualquer alteração neste repositório DEVE ser validada pelos Quality Gates automatizados antes de ser comitada:

1. **Gate Modular de Tamanho ($\le 350$ linhas):**
   ```bash
   node --test tests/modular_file_size_gate.test.cjs
   ```
   Valida que todas as fachadas e submódulos em `services/whatsapp/`, `services/financial/`, `services/voice/`, `js/modules/financeiro_*.js` e `css/*.css` possuem estritamente $\le 350$ linhas.

2. **Gate de Instalação Limpa e Integridade Criptográfica (SHA-256):**
   ```bash
   node scripts/gerar_manifesto_release.cjs
   node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs
   ```
   Valida que o manifesto de release (`docs/operacao/manifesto_release.json`) contém os hashes exatos de todos os arquivos de código e que uma instalação a frio inicializa perfeitamente com rotas `/health` e `/ready` operacionais.

3. **Blindagem e Isolamento de Estado durante Testes:**
   - Configurado em `scripts/test-preload.cjs`: redireciona automaticamente `DB_PATH` e `DATA_FILE` para diretório temporário isolado (`os.tmpdir()`) quando nenhum caminho explícito for fornecido.
   - O arquivo `data/database.json` NUNCA deve sofrer mutação durante a execução de testes (`git status --porcelain data/database.json` deve retornar vazio).

4. **Suíte Completa de Testes:**
   ```bash
   npm test
   ```
   Deve executar com **0 falhas** (esperado: $\ge 730$ testes passando).

---

## 3. Diretrizes de Trabalho para Agentes

- **Evidência antes de afirmações:** Nunca declare uma tarefa concluída ou um teste passando sem executar o comando e checar o exit code e logs reais.
- **Princípio da Menor Alteração Suficiente:** Não crie abstrações desnecessárias, novas bibliotecas não autorizadas ou arquivos fora do escopo.
- **Preservação de Docstrings e Comentários:** Preserve comentários técnicos e contratos públicos existentes.

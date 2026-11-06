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

### D. Frontend Financeiro & Analista Verônica (`js/modules/`)
- **Orquestrador Central:** `js/financeiro.js` (< 200 linhas) — mantém `viewFinanceiro()`, delegações e binds em `window`/`globalThis`.
- **Fachada Analista Verônica:** `js/modules/financeiro_analista.js` (< 70 linhas) — orquestrador de IA financeira.
- **Submódulos Financeiros:** `js/modules/`
  - `financeiro_dashboard.js` & `financeiro_dashboard_calc.js`: KPIs e métricas.
  - `financeiro_graficos.js`: Renderização de séries e gráficos SVG/Canvas.
  - `financeiro_titulos.js`: Contas a pagar e receber, baixa e recibos.
  - `financeiro_caixa.js` & `financeiro_estorno.js`: Fluxo de caixa e estornos compensatórios.
  - `financeiro_dre.js`: DRE gerencial e fechamento.
  - `financeiro_pix_hub.js`: Hub Pix, QR Codes e régua de cobrança.
  - `analista_calc.js`: Projeções de caixa, DRE e reconciliação.
  - `analista_kpi_cards.js` & `analista_controles.js`: Cards de KPI e controles internos.
  - `analista_chat_ui.js`: Chat interativo da analista Verônica.
  - `analista_caixa_modal.js`: Abertura, fechamento e lançamentos de caixa.
  - `analista_radar_oficina.js`: Radar de liberação e parecer financeiro de OS.
  - `analista_actions.js`: Faturamento a prazo, liquidação e régua de cobrança.
  - `analista_bi_produtividade.js`: BI e produtividade de mecânicos.
  - `analista_checkout_pix.js`: Modal de checkout Pix em tempo real.

### E. Cadastros, Central Fiscal e Plano de Contas (`js/modules/`)
- **Fachada Central:** `js/modules/cadastros_fiscal.js` (< 60 linhas) — preserva todos os binds fiscais e tributários.
- **Submódulos:** `js/modules/`
  - `cadastros_fiscal_regras.js`: Parametrização tributária, matriz de regras e simulador IVA Dual (EC 132/2023).
  - `cadastros_fiscal_nfe.js`: Central fiscal (NF-e mod 55, NFC-e mod 65, NFS-e, MDF-e), emissão e SEFAZ.
  - `cadastros_config_integracoes.js`: Boletos, régua de cobrança, contas caixa, usuários e APIs externas.
  - `cadastros_plano_contas.js`: Estrutura contábil da oficina e visualização em árvore.
  - `cadastros_plano_contas_actions.js`: CRUD, validações contábeis e restauração de padrões.

### F. Roteamento Centralizado de Eventos DOM (`js/modules/`)
- **Roteador Principal:** `js/modules/events.js` (< 100 linhas) — listeners globais de `click`, `change`, `input` e `keydown`.
- **Submódulos por Domínio:** `js/modules/`
  - `events_patio_os.js`: Ordens de serviço, itens, faturamento, veículos e fotos.
  - `events_patio_boxes.js`: Boxes físicos, alocação, gargalos, apontamento e checklist.
  - `events_estoque_compras.js`: Peças, compras, importação XML e OCR.
  - `events_financeiro_caixa.js`: Títulos, liquidação, conciliação e extrato bancário.
  - `events_whatsapp_voz.js`: Réguas WhatsApp, relatórios executivos e comandos de voz.
  - `events_cadastros.js`: Cadastros de clientes, fornecedores, mecânicos e serviços.
  - `events_sistema_config.js`: Onboarding, logos, backup, importação de sistemas e dados demo.

### G. Frontend Quadro de Serviços & Central de Automações (`js/modules/`)
- `js/modules/monday_board.js`: Quadro moderno de serviços com grupos expansíveis, toolbar e status em pílulas.
- `js/modules/automations_modal.js`: Central de automações em linguagem natural (IF/THEN).

### H. Folhas de Estilo Modulares (`css/`)
- **Agregador Mestre:** `style.css` (< 30 linhas via `@import`).
- **Folhas Temáticas:** `css/variables.css`, `css/base-layout.css`, `css/components.css`, `css/voice-drawer.css`, `css/voice-modal.css`, `css/financeiro.css`, `css/dashboard-operacional.css`, `css/patio-monday.css`, `css/patio-monday-cells.css`, `css/enterprise-nav.css`, `css/automations-modal.css`, `css/responsive.css`.

---

## 2. Quality Gates e Harness de Verificação Ativos

Qualquer alteração neste repositório DEVE ser validada pelos Quality Gates automatizados antes de ser comitada:

1. **Gate Modular de Tamanho ($\le 350$ linhas):**
   ```bash
   node --test tests/modular_file_size_gate.test.cjs
   ```
   Valida 8 categorias arquiteturais: fachadas e submódulos em `services/whatsapp/`, `services/financial/`, `services/voice/`, `js/modules/financeiro_*.js` (+ `analista_*.js`), `css/*.css`, `js/modules/cadastros_fiscal*.js` (+ `plano_contas*.js`) e `js/modules/events*.js` — todos estritamente $\le 350$ linhas.

2. **Gate de Auditoria de Ações e Zero Cliques Mortos:**
   ```bash
   node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs
   ```
   Valida que 100% dos botões, abas, links e handlers inline referenciam funções existentes no `window` e que todas as ações essenciais possuem listeners implementados.

3. **Gate de Fumaça E2E do Servidor:**
   ```bash
   node --require ./scripts/test-preload.cjs --test tests/server_smoke_e2e.test.cjs
   ```
   Valida inicialização a frio, login, cadastro, rotas críticas de API e saúde do backend em porta randômica isolada.

4. **Gate de Instalação Limpa e Integridade Criptográfica (SHA-256):**
   ```bash
   node scripts/gerar_manifesto_release.cjs
   node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs
   ```
   Valida que o manifesto de release (`docs/operacao/manifesto_release.json`) contém os hashes exatos de todos os arquivos de código e que uma instalação a frio inicializa perfeitamente com rotas `/health` e `/ready` operacionais.

5. **Blindagem e Isolamento de Estado durante Testes:**
   - Configurado em `scripts/test-preload.cjs`: redireciona automaticamente `DB_PATH` e `DATA_FILE` para diretório temporário isolado (`os.tmpdir()`) quando nenhum caminho explícito for fornecido.
   - O arquivo `data/database.json` NUNCA deve sofrer mutação durante a execução de testes (`git status --porcelain data/database.json` deve retornar vazio).

6. **Suíte Completa de Testes:**
   ```bash
   npm test
   ```
   Deve executar com **0 falhas** (esperado: $\ge 746$ testes passando).

---

## 3. Diretrizes de Trabalho para Agentes

- **Evidência antes de afirmações:** Nunca declare uma tarefa concluída ou um teste passando sem executar o comando e checar o exit code e logs reais.
- **Princípio da Menor Alteração Suficiente:** Não crie abstrações desnecessárias, novas bibliotecas não autorizadas ou arquivos fora do escopo.
- **Preservação de Docstrings e Comentários:** Preserve comentários técnicos e contratos públicos existentes.


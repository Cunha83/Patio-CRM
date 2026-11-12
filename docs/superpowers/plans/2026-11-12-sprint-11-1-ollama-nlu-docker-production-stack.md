# Sprint 11.1 — Implementation Plan
# Motor NLU Híbrido Ollama Local com Tool Calling Estruturado & Monitor de Stack Docker de Produção

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar e homologar a Sprint 11.1, dotando o Pátio-CRM de um Motor NLU Híbrido com Tool Calling estruturado via Ollama Local (com suporte a inferência em GPU NVIDIA) e fallback determinístico de latência zero para todas as 6 Skills do Agente WhatsApp, além de um Monitor de Prontidão de Produção e gerador de blueprint Docker Compose (Pátio-CRM + Evolution API + Ollama + Postgres + Redis).

**Architecture:**
- `services/whatsapp/whatsappLocalLlmNluService.js`: Motor NLU com catálogo de 6 Skills/Tools, extrator de entidades regex-driven (placa, km, cliente, valores, peças), despacho estruturado com guarda RBAC (403 para perfis não autorizados em comandos gerenciais) e fallback determinístico imediato em caso de indisponibilidade do Ollama.
- `services/ops/productionDockerStackService.js`: Monitor de prontidão de infraestrutura avaliando 4 subsistemas (Core ERP, Evolution Gateway, Ollama NLU, Conexão Bancária) gerando score 0-100 e blueprint completo Docker Compose com suporte a GPU NVIDIA e variáveis `.env.example` higienizadas.
- `routes/whatsapp_nlu_producao.routes.js`: 4 endpoints REST integrados com verificação de permissões.
- `js/modules/whatsapp_nlu_producao_ui.js` e `actions.js`: Console visual de teste de NLU, monitor de stack e modais interativos com zero cliques mortos.
- `tests/sprint111_ollama_nlu_docker_production_stack.test.cjs`: Suíte TDD abrangente.

**Tech Stack:** Node.js, Express, Ollama HTTP API, Docker Compose v3.8, Vanilla JS modular, node:test runner.

---

## Global Constraints
- Todos os arquivos do repositório devem permanecer estritamente `<= 350` linhas (meta `<= 260` linhas para novos arquivos).
- `js/modules/events_patio_os.js` permanece estritamente intocado em 237 linhas.
- Preservação da guarda RBAC: Comandos financeiros, de conciliação, compras e renegociação executados via NLU por usuários não gerenciais retornam HTTP 403 `WHATSAPP_UNAUTHORIZED_MANAGEMENT_SKILL`.
- `data/database.json` nunca deve sofrer mutação durante testes (isolamento via `test-preload.cjs`).
- Zero cliques mortos: todos os botões e links com `data-act` devem possuir handlers implementados.

---

## Review Focus
1. **Extração de Entidades:** Reconhecer placas de caminhão (padrão Mercosul `ABC1D23` e antigo `ABC-1234`) e quilometragem (`412500 km`), roteando para `SKILL_RECEPCAO_PATIO` e executando a triagem de portaria com dados reais.
2. **Resiliência do Fallback Determinístico:** Quando `simularFalhaOllama === true` ou timeout no Ollama, comutar para o fallback sem lançar exceção não tratada, marcando `fallbackAcionado: true` e preservando o atendimento.
3. **Guarda RBAC em Camada NLU:** Bloquear clientes comuns que tentem disparar DRE, caixa, régua de cobrança ou cotação de compras via NLU com erro 403.
4. **Healthcheck e Blueprint Docker:** Calcular corretamente o `scoreProntidaoInfra` e incluir reservas de GPU NVIDIA (`count: all, capabilities: [gpu]`) no serviço do Ollama quando `usarGpuNvidia: true`.

---

## Tarefas de Execução

### Task 1: [NLU] Motor NLU Híbrido Ollama Local & Tool Calling Estruturado
**Files:**
- Create: `services/whatsapp/whatsappLocalLlmNluService.js`
- Test: `tests/sprint111_ollama_nlu_docker_production_stack.test.cjs`

- [ ] Criar `services/whatsapp/whatsappLocalLlmNluService.js` (meta <= 265 linhas) implementando:
  - `configurarProvedorNluWhatsApp(state, payload)`
  - `interpretarMensagemNluHibrido(state, payload)` com catálogo de Tools e extração de entidades
  - `rotearMensagemComNluParaSkill(state, payload)` com guarda RBAC e dispatch para a respectiva Skill
- [ ] Testar extração de placas, km, comutação de fallback determinístico e bloqueio RBAC 403.

### Task 2: [Ops] Monitor de Prontidão da Stack de Produção & Docker Compose
**Files:**
- Create: `services/ops/productionDockerStackService.js`
- Test: `tests/sprint111_ollama_nlu_docker_production_stack.test.cjs`

- [ ] Criar `services/ops/productionDockerStackService.js` (meta <= 240 linhas) implementando:
  - `gerarConfiguracaoStackProducao(state, options)` com YAML Docker Compose, `.env.example` e comandos setup
  - `executarHealthcheckIntegradoProducao(state, options)` avaliando os 4 componentes e apurando `scoreProntidaoInfra`
- [ ] Testar diagnósticos de prontidão e geração do blueprint Docker com GPU NVIDIA.

### Task 3: Rotas REST Backend & Montagem
**Files:**
- Create: `routes/whatsapp_nlu_producao.routes.js` (meta <= 190 linhas)
- Modify: `routes/index.js`
- Test: `tests/sprint111_ollama_nlu_docker_production_stack.test.cjs`

- [ ] Criar `routes/whatsapp_nlu_producao.routes.js` com os 4 endpoints REST:
  - `POST /api/whatsapp/nlu/configurar`
  - `POST /api/whatsapp/nlu/interpretar-executar`
  - `GET /api/ops/producao/healthcheck-stack`
  - `GET /api/ops/producao/docker-blueprint`
- [ ] Montar em `routes/index.js`.

### Task 4: Componentes Visuais de UI e Ações Frontend
**Files:**
- Create: `js/modules/whatsapp_nlu_producao_ui.js` (meta <= 250 linhas)
- Create: `js/modules/whatsapp_nlu_producao_actions.js` (meta <= 250 linhas)
- Modify: `index.html`

- [ ] Criar `whatsapp_nlu_producao_ui.js` com console de NLU e monitor de stack Docker.
- [ ] Criar `whatsapp_nlu_producao_actions.js` com binds globais e listener delegado `document.addEventListener('click', ...)`.
- [ ] Registrar ambos em `index.html`.

### Task 5: Suíte de Testes TDD, Quality Gates e Homologação
- [ ] Escrever `tests/sprint111_ollama_nlu_docker_production_stack.test.cjs` (<= 350 linhas).
- [ ] Executar testes da Sprint 11.1 e sprints integradas (10.5, 10.4, 10.3, 10.2).
- [ ] Validar `tests/modular_file_size_gate.test.cjs` (100% dos arquivos <= 350 linhas).
- [ ] Validar `tests/ui_actions_and_bindings_audit.test.cjs` (zero cliques mortos).
- [ ] Validar `tests/server_smoke_e2e.test.cjs`.
- [ ] Regenerar e certificar manifesto de instalação limpa (`clean_install_manifest.test.cjs`).
- [ ] Rodar `npm test` garantindo 100% de aprovação.
- [ ] Atualizar `progress.md`, commitar e dar push.


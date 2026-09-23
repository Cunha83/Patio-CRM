# Assistente Financeiro, Robustez do Navegador e Homologação Funcional Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capacitar o Agente Inteligente a responder a todas as consultas sobre o módulo financeiro (próximos vencimentos a pagar, a receber, saldo de caixa) e treinamento sobre todos os módulos do Pátio CRM, conferir robustez total e timeout ao runner do navegador com evidências timestamped e sanitizadas, diferenciar o estado real da integração externa (não configurada vs transporte não implementado) e comprovar o cadastro manual sem provedor externo.

**Architecture:** 
1. `services/voiceActionEngine.js`: expandir intenções semânticas (regras e Gemini) para `consultar_financeiro`, `consultar_estoque`, `consultar_patio`, `consultar_cadastros` e `ajuda_sistema_treinamento`, integrando com `financialEngine.js`, `state.contas` e base de conhecimento estruturada dos módulos.
2. `services/consultaClienteService.js`: diferenciar explicitamente `INTEGRACAO_NAO_CONFIGURADA`, `TRANSPORTE_NAO_IMPLEMENTADO` e `FALHA_PROVEDOR_EXTERNO`, garantindo cadastro manual sem falsas mensagens de "temporariamente inacessível".
3. `scripts/run_agent_browser_verified.cjs`: encapsular `runBatch` com timeout estrito por lote, captura e rejeição explícita de falhas, encerramento de subprocessos com PID track, arquivos de log únicos com data/hora e sanitização permanente de credenciais (`[REDACTED]`), adicionando a jornada de cadastro manual sem provedor.

**Tech Stack:** Node.js, Express, SQLite (`better-sqlite3`), `agent-browser` (Chromium headless), `financialEngine.js`, `voiceActionEngine.js`.

**Spec:** Baseado na especificação das solicitações do usuário e diretrizes de homologação funcional isolada.

## Global Constraints
- Nenhuma dependência externa nova em produção.
- Sem mocks no caminho operacional (`NODE_ENV === 'test'` + flag opt-in estrita para testes).
- Credenciais e tokens SEMPRE redigidos (`[REDACTED]`).
- Sem corrupção do banco operacional (`patio.db`); execução 100% isolada em tempdirs.

---

### Task 1: Diferenciação Canônica do Estado da Integração Externa

**Files:**
- Modify: `services/consultaClienteService.js`
- Test: `tests/consulta_cliente_api.test.cjs`

**Interfaces:**
- Produces: Respostas com códigos `INTEGRACAO_NAO_CONFIGURADA` (quando sem chaves), `TRANSPORTE_NAO_IMPLEMENTADO` (quando configurado mas sem driver HTTP implementado) e `FALHA_PROVEDOR_EXTERNO` (quando chamada de rede falhar).

- [ ] **Step 1: Atualizar `services/consultaClienteService.js`**
  Substituir mensagem genérica de `SERVICO_EXTERNO_INDISPONIVEL` por `TRANSPORTE_NAO_IMPLEMENTADO`.
- [ ] **Step 2: Executar testes existentes de consulta**
  Executar `node --test tests/consulta_cliente_api.test.cjs` e garantir aprovação.

---

### Task 2: Motor Inteligente do Agente de Voz para Finanças, Estoque, Pátio e Treinamento

**Files:**
- Modify: `services/voiceActionEngine.js`
- Test: `tests/voice_financial_and_training.test.cjs`

**Interfaces:**
- Consumes: `financialEngine.calcularKPIsFinanceiros(state)`, `state.contas`, `state.pecas`, `state.os`, `state.boxes`, `state.clientes`.
- Produces: Novas ações executáveis `consultar_financeiro` (vencimentos pagar, receber, saldo, faturamento), `consultar_estoque` (itens críticos, saldos), `consultar_patio` (status e boxes) e `ajuda_sistema_treinamento` (passo a passo dos módulos).

- [ ] **Step 1: Criar novo teste `tests/voice_financial_and_training.test.cjs`**
  Testar consultas de próximos vencimentos a pagar, contas a receber, saldo de caixa, itens críticos de estoque e dúvidas de treinamento ("como cadastrar cliente", "como abrir OS").
- [ ] **Step 2: Implementar extração por regras e enriquecer prompt do Gemini em `services/voiceActionEngine.js`**
  Adicionar detecção para consultas financeiras e de treinamento.
- [ ] **Step 3: Implementar executores das novas intenções em `executarAcao`**
  Formatar respostas humanas completas, precisas e educativas.
- [ ] **Step 4: Executar `node --test tests/voice_financial_and_training.test.cjs`**
  Validar aprovação de 100% dos testes.

---

### Task 3: Controle de Robustez, Timeouts e Sanitização do Runner de Navegador

**Files:**
- Modify: `scripts/run_agent_browser_verified.cjs`

**Interfaces:**
- Consumes: `agent-browser batch --bail --json`.
- Produces: Log timestamped único (`agent-browser-verified-<timestamp>.log`), timeout por lote (35s) com identificação do lote, encerramento de processos filhos e rejeição explícita de `success: false`.

- [ ] **Step 1: Adicionar gerador de arquivo de log timestamped preservando o histórico**
- [ ] **Step 2: Adicionar timeout de lote de 35s com cancelamento do child process no `runBatch`**
- [ ] **Step 3: Adicionar rejeição estrita se qualquer comando retornar `success: false`**
- [ ] **Step 4: Adicionar Jornada 1A (Cadastro Manual sem Provedor)**
  Comprovar que na ausência do provedor (`ENABLE_TEST_CONSULTA_MOCK: 'false'`), o aviso é exibido e o cliente é cadastrado e salvo com sucesso pelos inputs do DOM, sem score inventado.
- [ ] **Step 5: Manter Jornada 1B (Mock Opt-in de Teste), Jornada 2 (OS & Pickers), Jornada 3 (Mecânico), Jornada 4 (Admin Reconciliação), Jornada 5 (Assistente)**
- [ ] **Step 6: Adicionar Jornada 6 (Assistente Respondendo a Consultas Financeiras no Navegador)**

---

### Task 4: Execução e Validação das Jornadas no Navegador via `agent-browser`

**Files:**
- Run: `node scripts/run_agent_browser_verified.cjs`
- Output: `docs/evidencias/agent-browser-verified-<timestamp>.log` e `docs/evidencias/agent-browser-verified.log`

- [ ] **Step 1: Executar o runner de navegador verificado**
- [ ] **Step 2: Conferir código de saída 0 e ausência de travamentos**
- [ ] **Step 3: Inspecionar o log para confirmar redação total de credenciais (`[REDACTED]`)**

---

### Task 5: Retificação do Parecer Técnico de Prontidão

**Files:**
- Modify: `docs/evidencias/parecer-prontidao-final.md`

- [ ] **Step 1: Atualizar métricas exatas de RTO (`3940.34 ms` sob concorrência e SLA < 5s isolado)**
- [ ] **Step 2: Declarar o módulo fiscal como Bloqueado para Piloto Real conforme `FISCAL_ENTREGA.md`**
- [ ] **Step 3: Documentar a obrigatoriedade de rotação das credenciais expostas em execuções antigas**
- [ ] **Step 4: Declarar o status da integração externa (modo manual seguro; transporte não implementado em produção; mock restrito a teste)**

---

### Task 6: Suíte Completa de Testes (`npm test`) e Consolidação Final

**Files:**
- Run: `npm test`
- Output: `docs/evidencias/testes-completos-execucao.txt`
- Modify: `walkthrough.md`

- [ ] **Step 1: Executar suíte completa de testes (`npm test`) com saída integral preservada**
- [ ] **Step 2: Verificar zero falhas**
- [ ] **Step 3: Atualizar walkthrough com resumo executivo, tabela de jornadas e evidências**

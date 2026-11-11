# Plano de Implementação: Sprint 9.3 — Portaria Inteligente, Fast Check-in 360º & Controle de Saída Segura

> **Branch:** `main`  
> **Status:** Concluído com Sucesso  
> **Metodologia:** Superpowers + Vibe Coding (TDD Red-Green-Refactor, Ponytail Full, Teto Modular <= 350 linhas, Verification Before Completion)

---

## 1. Visão Geral e Arquitetura

A **Sprint 9.3 (Fechamento da Fase 9)** fecha o ecossistema operacional integrando a portaria e guarita da oficina pesada com todos os motores das Fases 5 (Comercial B2B), 6 (Pátio & Boxes), 7 (Financeiro & Inadimplência) e 8 (Preditiva & Garantias por Eixo):

1. **Triagem 360º na Chegada por Placa (`realizarTriagemPortariaPorPlaca`):**
   - Atualização automática de telemetria de hodômetro (`atualizarTelemetriaKmFrota`).
   - Identificação do Cliente vinculado à placa.
   - Diagnóstico da situação de crédito do Cliente (`clienteId`): borderôs vencidos, títulos a receber vencidos, limite global de crédito e exposição total.
   - Garantias vigentes por eixo e lado (`avaliarCoberturaGarantiaPecaOuServico`).
   - Alertas de manutenção preventiva preditiva vencidos ou críticos (`apurarRadarPreventivaPreditiva`).
   - Oportunidades de demanda reprimida e orçamentos pendentes/adiados daquela placa (`state.opportunities`).
   - Recomendação de Box Pesado livre para o tipo de serviço.

2. **Fast Check-in 360º com Bloqueio de Crédito Centralizado no Cliente (`registrarFastCheckinPortaria360`):**
   - Bloqueio estrito de check-in para clientes com inadimplência ativa (`CLIENT_CREDIT_BLOCKED_AT_GATEHOUSE`).
   - Exceção para atendimentos de garantia isenta (`atendimentoGarantiaIsento: true`) ou override gerencial auditado com justificativa obrigatória (`autorizarOverrideCreditoCliente: true`).
   - Abertura automática de OS integrando pendências selecionadas (oportunidades e preventivas).
   - Alocação automática no Box livre recomendado (`alocarVeiculoBox`).
   - Registro em `state.gatehouseLogs`.

3. **Controle de Saída Segura na Portaria / Cancela (`registrarSaidaPortariaVeiculo`):**
   - Validação obrigatória de checklist técnico de qualidade pré-entrega (`validarLiberacaoQualidadeOS`), bloqueando saída com `QUALITY_INSPECTION_REQUIRED_OR_FAILED` se não aprovada.
   - Desocupação automática de box (`liberarBoxPatio`).
   - Cálculo do tempo total de permanência no pátio e registro de saída.

4. **Endpoints REST e Interface Visual SPA:**
   - 4 novos endpoints em `routes/patio_portaria_inteligente.routes.js`.
   - Componentes visuais para busca de placa, diagnóstico 360º na chegada, modais de check-in e saída.
   - Listener delegado no `document` via `[data-act]`, mantendo `events_patio_os.js` estritamente intocado.

---

## 2. Guardrails de Tamanho e Arquivos Envolvidos

- `services/patio/smartGatehouseCheckinService.js` (NOVO, <= 350 linhas).
- `routes/patio_portaria_inteligente.routes.js` (NOVO, <= 350 linhas), montado em `routes/index.js`.
- `js/modules/patio_portaria_inteligente_ui.js` (NOVO, <= 350 linhas).
- `js/modules/patio_portaria_inteligente_actions.js` (NOVO, <= 350 linhas).
- `index.html` (MODIFICADO, inclusão dos 2 scripts na seção de pátio).
- `tests/sprint93_smart_gatehouse_triage_checkin.test.cjs` (NOVO, <= 350 linhas).

**Arquivos Estritamente Intocados:**
- `services/executive/controlTowerService.js` (347 linhas)
- `routes/crm_manutencao_oportunidades.routes.js` (343 linhas)
- `services/billing/fleetBorderoService.js` (341 linhas)
- `js/modules/orcamento_parcial_ui.js` (339 linhas)
- `js/modules/crm_conversao_oportunidades_ui.js` (336 linhas)
- `js/modules/events_patio_os.js` (333 linhas)
- `services/fiscal/b2bFiscalClosingService.js` (332 linhas)

---

## 3. Tarefas de Implementação

### Task 1: TDD Red — Suíte de Testes da Sprint 9.3
- Criar `tests/sprint93_smart_gatehouse_triage_checkin.test.cjs`.
- Sub-teste 1.1: Triagem 360º por placa com cruzamento de garantia por eixo, preventivas, demanda reprimida, situação de crédito do cliente e sugestão de box.
- Sub-teste 1.2: Bloqueio de crédito do cliente no Fast Check-in vs. exceção de garantia isenta e override com justificativa.
- Sub-teste 1.3: Fast Check-in incorporando demanda reprimida/preventiva, alocação automática de box e trava de cancela por checklist de qualidade na saída.
- Sub-teste 1.4: Endpoints REST e componentes visuais de UI.
- Executar teste e confirmar falha inicial (RED).

### Task 2: Backend Service — `services/patio/smartGatehouseCheckinService.js`
- Implementar `realizarTriagemPortariaPorPlaca(state, payload)`.
- Implementar `registrarFastCheckinPortaria360(state, payload)`.
- Implementar `registrarSaidaPortariaVeiculo(state, portariaLogId, payload)`.
- Implementar `listarMovimentacaoPortariaPatio(state, options)`.
- Executar suíte da Sprint 9.3 até atingir GREEN.

### Task 3: REST API & Rotas — `routes/patio_portaria_inteligente.routes.js`
- `POST /api/patio/portaria/triagem-placa`
- `POST /api/patio/portaria/fast-checkin`
- `POST /api/patio/portaria/:id/saida`
- `GET  /api/patio/portaria/movimentacoes`
- Montar em `routes/index.js`.

### Task 4: Frontend UI & Event Actions
- Criar `js/modules/patio_portaria_inteligente_ui.js`:
  - `renderPainelPortariaInteligenteHtml(dados)`
  - `modalFastCheckinPortaria360Html(triagem)`
  - `modalRegistrarSaidaPortariaHtml(log)`
- Criar `js/modules/patio_portaria_inteligente_actions.js`:
  - `consultarTriagemPlacaPortariaAction`, `abrirModalFastCheckinPortaria`, `confirmarFastCheckinPortariaAction`, `abrirModalSaidaPortaria`, `registrarSaidaVeiculoPortariaAction`.
  - Listener delegado em `document` via `[data-act]`.
- Registrar scripts em `index.html`.
- Confirmar `events_patio_os.js` intocado em 333 linhas.

### Task 5: Protocolo de Homologação e Quality Gates
- Suíte da Sprint 9.3 (100% PASS).
- Gate modular de tamanho de arquivo (`modular_file_size_gate.test.cjs`).
- Auditoria de ações e zero cliques mortos (`ui_actions_and_bindings_audit.test.cjs`).
- Isolamento do banco de dados (`git status --porcelain data/database.json`).
- Manifesto de release SHA-256 e Clean Install (`clean_install_manifest.test.cjs`).
- Suíte completa (`npm test` >= 915 testes, 0 falhas).
- Atualizar `progress.md`, commit semântico e Push.

# Plano de Implementação: Sprint 9.1 — Torre de Controle Executiva 360º, Motor de Alertas Críticos e Briefing Diário WhatsApp

> **Branch:** `main`  
> **Status:** Em Planejamento  
> **Metodologia:** Superpowers + Vibe Coding (TDD Red-Green-Refactor, Ponytail Full, Teto Modular <= 350 linhas, Verification Before Completion)

---

## 1. Visão Geral e Arquitetura

A **Sprint 9.1 (Abertura da Fase 9)** implementa o centro de comando estratégico da oficina pesada: a **Torre de Controle Executiva 360º**. Este módulo unifica e orquestra em tempo real os indicadores das Fases 5 (Comercial B2B), 6 (Pátio & Boxes), 7 (Financeiro & DRE) e 8 (Preditiva & Fiscal), provendo uma visão holística para a diretoria através de:
1. **Consolidação 360º dos 4 Quadrantes Estruturais:**
   - **Pilar Pátio & Qualidade:** Ocupação de boxes, gargalos estourados, retrabalhos e eficiência da equipe.
   - **Pilar Comercial B2B:** Demanda reprimida, links de aprovação externa pendentes e pedidos de compras.
   - **Pilar Financeiro & DRE:** Regime de Competência vs. Caixa, Ponto de Equilíbrio e frotas inadimplentes.
   - **Pilar Preditiva & Fiscal:** Preventivas vencidas/críticas, receita potencial e faturamento fiscal segregado (NF-e/NFS-e).
2. **Score de Saúde Operacional (0 a 100) e Classificação de Status Geral:**
   - Classificação ponderada em: `'excelencia_operacional'` (>= 85), `'operacao_estavel'` (70-84), `'atencao_gerencial'` (50-69) ou `'intervencao_critica'` (< 50).
3. **Motor de Fila de Alertas Críticos de Comando:**
   - Priorização estruturada por severidade (`'critica'` > `'alta'` > `'media'`), cobrindo gargalos com SLA estourado, bloqueios de inadimplência, retrabalhos abertos, orçamentos pendentes de assinatura, manutenções vencidas e follow-ups atrasados.
4. **Disparo de Briefing Diário no Agente WhatsApp da Diretoria:**
   - Geração de briefing executivo consolidado com top alertas e integração à `SKILL_ANALISTA_FINANCEIRO` com guarda RBAC.
5. **Endpoints REST e Interface Visual SPA:**
   - Painel 360º de comando, modais executivos e ações delegadas, mantendo `events_patio_os.js` estritamente intocado.

---

## 2. Guardrails de Tamanho e Arquivos Envolvidos

- `services/executive/controlTowerService.js` (NOVO, <= 350 linhas).
- `routes/torre_controle_executiva.routes.js` (NOVO, <= 350 linhas), montado em `routes/index.js`.
- `js/modules/torre_controle_executiva_ui.js` (NOVO, <= 350 linhas).
- `js/modules/torre_controle_executiva_actions.js` (NOVO, <= 350 linhas).
- `services/whatsapp/whatsappAgentSkillsService.js` (MODIFICADO, <= 18 linhas adicionais, teto <= 315 linhas).
- `index.html` (MODIFICADO, inclusão dos 2 scripts).
- `tests/sprint91_executive_control_tower_360.test.cjs` (NOVO, <= 350 linhas).

**Arquivos Estritamente Intocados:**
- `routes/crm_manutencao_oportunidades.routes.js` (343 linhas)
- `services/billing/fleetBorderoService.js` (341 linhas)
- `js/modules/orcamento_parcial_ui.js` (339 linhas)
- `js/modules/crm_conversao_oportunidades_ui.js` (336 linhas)
- `js/modules/events_patio_os.js` (333 linhas)
- `services/fiscal/b2bFiscalClosingService.js` (332 linhas)
- `services/patio/mechanicTimeTrackingService.js` (317 linhas)
- `services/quotation/externalFleetApprovalService.js` (313 linhas)
- `js/modules/patio_prontuario_laudo_ui.js` (308 linhas)
- `services/finance/executiveDreBreakEvenService.js` (301 linhas)

---

## 3. Tarefas de Implementação

### Task 1: TDD Red — Suíte de Testes da Sprint 9.1
- Criar `tests/sprint91_executive_control_tower_360.test.cjs`.
- Sub-teste 1.1: Consolidação 360º dos 4 pilares operacionais (`consolidarTorreControleExecutiva360`).
- Sub-teste 1.2: Score de saúde operacional (0-100) e fila priorizada de alertas de comando (`gerarFilaAlertasCriticosComando`).
- Sub-teste 1.3: Disparo de briefing diário e consulta via Agente WhatsApp gerencial.
- Sub-teste 1.4: Endpoints REST e componentes visuais de UI.
- Executar teste e confirmar falha inicial (RED).

### Task 2: Backend Service — `services/executive/controlTowerService.js`
- Implementar `gerarFilaAlertasCriticosComando(state, options)`.
- Implementar `consolidarTorreControleExecutiva360(state, options)`.
- Implementar `dispararBriefingDiarioDiretoriaWhatsApp(state, options)`.
- Adicionar gancho na `SKILL_ANALISTA_FINANCEIRO` em `services/whatsapp/whatsappAgentSkillsService.js`.
- Executar suíte da Sprint 9.1 até atingir GREEN.

### Task 3: REST API & Rotas — `routes/torre_controle_executiva.routes.js`
- `GET  /api/executivo/torre-controle`
- `GET  /api/executivo/torre-controle/alertas-criticos`
- `POST /api/executivo/torre-controle/briefing-whatsapp`
- Montar em `routes/index.js`.

### Task 4: Frontend UI & Event Actions
- Criar `js/modules/torre_controle_executiva_ui.js`:
  - `renderPainelTorreControleExecutivaHtml(dados)`
  - `modalDispararBriefingExecutivoHtml(dados)`
- Criar `js/modules/torre_controle_executiva_actions.js`:
  - `atualizarTorreControleAction`, `filtrarAlertasCriticosTorreAction`, `abrirModalBriefingExecutivo`, `confirmarDisparoBriefingWhatsAppAction`.
  - Listener delegado em `document` via `[data-act]`.
- Registrar scripts em `index.html`.
- Confirmar `events_patio_os.js` intocado em 333 linhas.

### Task 5: Protocolo de Homologação e Quality Gates
- Suíte da Sprint 9.1 (100% PASS).
- Gate modular de tamanho de arquivo (`modular_file_size_gate.test.cjs`).
- Auditoria de ações e zero cliques mortos (`ui_actions_and_bindings_audit.test.cjs`).
- Isolamento do banco de dados (`git status --porcelain data/database.json`).
- Manifesto de release SHA-256 e Clean Install (`clean_install_manifest.test.cjs`).
- Suíte completa (`npm test` >= 905 testes, 0 falhas).
- Atualizar `progress.md`, commit semântico e Push.

# Sprint 6.3: Gestão Visual de Boxes Pesados, Ocupação de Pátio & Monitoramento de SLA de Gargalos de Parada

> **Goal:** Implementar a gestão visual e ocupação em tempo real de boxes físicos de linha pesada (molas, alinhamento, prensas, freios), rastreamento de transferências atômicas entre postos de trabalho, liberação integrada com checklist de qualidade, e monitoramento ativo de SLA de gargalos de parada de pátio (aguardando peça, aprovação de frotista, prensa) com classificação de semáforo e KPIs executivos de ofensores.

**Architecture:**
- `services/patio/patioBoxManagementService.js` (<= 350 linhas): Cadastro de boxes, anti-colisão, alocação, transferência atômica com tempo de permanência e liberação com gate de qualidade.
- `services/patio/patioBottleneckSlaService.js` (<= 350 linhas): Gestão de paradas por gargalo com SLA parametrizado, semáforo dinâmico (no_prazo, alerta_sla, sla_estourado) e consolidação de KPIs de pátio e ofensores.
- `routes/patio_boxes_gargalos.routes.js` (<= 350 linhas): Rotas REST completas montadas em `routes/index.js`.
- `js/modules/patio_boxes_gargalos_ui.js` (<= 350 linhas): Grid visual de boxes por cor de estado, cartões de KPIs de ocupação e semáforo, e modais.
- `js/modules/patio_boxes_gargalos_actions.js` (<= 350 linhas): Handlers e delegação de eventos via `[data-act]` sem tocar em `events_patio_os.js`.
- `tests/sprint63_patio_boxes_bottlenecks_sla.test.cjs` (<= 350 linhas): Testes unitários, regras de negócio, HTTP integration e UI bindings em TDD.

---

## Tasks

### Task 1: Gestão de Boxes Pesados e Giro de Pátio (`patioBoxManagementService.js`)
- [ ] Criar teste unitário em `tests/sprint63_patio_boxes_bottlenecks_sla.test.cjs` para cadastro, alocação, bloqueio anti-colisão (`BOX_ALREADY_OCCUPIED`, `OS_ALREADY_ALLOCATED_IN_BOX`), transferência entre boxes e liberação de box com exigência de qualidade (`QUALITY_INSPECTION_REQUIRED_OR_FAILED`).
- [ ] Confirmar falha (RED).
- [ ] Implementar `services/patio/patioBoxManagementService.js` (<= 350 linhas).
- [ ] Confirmar aprovação (GREEN).

### Task 2: Monitoramento de Gargalos de Parada e SLA (`patioBottleneckSlaService.js`)
- [ ] Adicionar testes para abertura de gargalo (mudando box para `bloqueado_gargalo`), encerramento de parada calculando `tempoParadoMinutos` e `estourouSla`, semáforo dinâmico e consolidação de KPIs de ocupação e ofensores.
- [ ] Confirmar falha (RED).
- [ ] Implementar `services/patio/patioBottleneckSlaService.js` (<= 350 linhas).
- [ ] Confirmar aprovação (GREEN).

### Task 3: Rotas REST (`patio_boxes_gargalos.routes.js`)
- [ ] Adicionar teste de integração HTTP para os 8 endpoints.
- [ ] Implementar `routes/patio_boxes_gargalos.routes.js` (<= 350 linhas) e registrar em `routes/index.js`.
- [ ] Confirmar aprovação (GREEN).

### Task 4: Frontend UI & Eventos (`patio_boxes_gargalos_ui.js` & `patio_boxes_gargalos_actions.js`)
- [ ] Implementar `js/modules/patio_boxes_gargalos_ui.js` (<= 350 linhas) e `js/modules/patio_boxes_gargalos_actions.js` (<= 350 linhas).
- [ ] Registrar ambos em `index.html`.
- [ ] Validar binds no sandbox e rodar `ui_actions_and_bindings_audit.test.cjs`.
- [ ] Confirmar aprovação (GREEN).

### Task 5: Quality Gates, Homologação e Fechamento
- [ ] Validar teto modular (`modular_file_size_gate.test.cjs`).
- [ ] Validar auditoria de UI (`ui_actions_and_bindings_audit.test.cjs`).
- [ ] Verificar isolamento de banco de dados (`data/database.json`).
- [ ] Atualizar manifesto de release (`gerar_manifesto_release.cjs`) e validar (`clean_install_manifest.test.cjs`).
- [ ] Executar suíte completa (`npm test`).
- [ ] Commit semântico e push para `main`.


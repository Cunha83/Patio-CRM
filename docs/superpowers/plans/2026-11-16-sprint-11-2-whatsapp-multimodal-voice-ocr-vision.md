# Sprint 11.2 — Implementation Plan
# Motor de Processamento de Áudio/Voz (Transcrição ASR Whisper) & Visão/OCR Técnico no WhatsApp (DANFE, Comprovantes PIX, Portaria e Peça Condenada)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar e homologar a Sprint 11.2, equipando o Agente WhatsApp do Pátio-CRM com capacidades multimodais completas:
1. Processamento e transcrição de Áudio/Voz (ASR Whisper Local/API) integrado ao Motor NLU Híbrido com proteção RBAC 403;
2. Visão Computacional e OCR Técnico de Imagens/Fotos cobrindo 4 fluxos operacionais críticos (Baixa de comprovante PIX, Entrada de DANFE/NF com recálculo CMP e baixa de gargalo, Triagem de Placa/Hodômetro na Portaria e Registro de Peça Condenada no Box com link externo e retenção do veículo);
3. Gancho inbound em `services/whatsapp/whatsappGatewayAdapterService.js` (mantendo-o <= 255 linhas);
4. Rotas REST, console frontend UI/Actions com zero cliques mortos, suíte TDD e certificação via Quality Gates.

**Architecture:**
- `services/whatsapp/whatsappMultimodalAudioVisionService.js`: Motor multimodal central (meta <= 270 linhas) com:
  - `configurarProvedoresMultimodaisWhatsApp(state, payload)`
  - `transcreverAudioEExecutarSkillWhatsApp(state, payload)` -> conecta ASR ao `rotearMensagemComNluParaSkill` (com guarda RBAC gerencial/financeira herdada)
  - `processarImagemOcrWhatsApp(state, payload)` -> despacha para `bankDirectApiConnectorService`, `heavyPartsPurchaseOrderService` (com RBAC 403), `smartGatehouseCheckinService` e `mechanicSmartDispatchBoxService`.
  - `obterTelemetriaMultimodalWhatsApp(state)`
- `services/whatsapp/whatsappGatewayAdapterService.js`: Gancho enxuto (<= 15 linhas adicionais, mantendo arquivo <= 255 linhas) para direcionar `audioMessage` / `imageMessage` ao serviço multimodal.
- `routes/whatsapp_multimodal_ia.routes.js`: 4 rotas REST (configurar, processar-audio, processar-imagem-ocr, telemetria).
- `js/modules/whatsapp_multimodal_ia_ui.js` e `actions.js`: Componentes visuais para teste e operação multimodal.
- `tests/sprint112_whatsapp_multimodal_voice_ocr_vision.test.cjs`: Suíte TDD com cobertura completa dos 4 fluxos de OCR e áudio.

---

## Global Constraints
- Todos os arquivos do repositório devem permanecer estritamente `<= 350` linhas (meta `<= 260` linhas para novos arquivos).
- `js/modules/events_patio_os.js` permanece estritamente intocado em 237 linhas.
- `services/whatsapp/whatsappGatewayAdapterService.js` deve permanecer `<= 255` linhas (atualmente 241).
- `data/database.json` nunca deve sofrer mutação durante testes (isolamento via `test-preload.cjs`).
- Zero cliques mortos: todos os botões e links com `data-act` devem possuir handlers implementados.

---

## Tarefas de Execução

### Task 1: [Backend] Motor Multimodal de Áudio/Voz e Visão/OCR
**Files:**
- Create: `services/whatsapp/whatsappMultimodalAudioVisionService.js`
- Test: `tests/sprint112_whatsapp_multimodal_voice_ocr_vision.test.cjs`

- [ ] Criar `services/whatsapp/whatsappMultimodalAudioVisionService.js` (meta <= 270 linhas) implementando:
  - `configurarProvedoresMultimodaisWhatsApp(state, payload)`
  - `transcreverAudioEExecutarSkillWhatsApp(state, payload)`
  - `processarImagemOcrWhatsApp(state, payload)` com os 4 fluxos operacionais
  - `obterTelemetriaMultimodalWhatsApp(state)`
- [ ] Integrar gancho de áudio/imagem em `services/whatsapp/whatsappGatewayAdapterService.js` (garantindo <= 255 linhas).

### Task 2: [Backend] Rotas REST & Montagem Central
**Files:**
- Create: `routes/whatsapp_multimodal_ia.routes.js`
- Modify: `routes/index.js`
- Test: `tests/sprint112_whatsapp_multimodal_voice_ocr_vision.test.cjs`

- [ ] Criar `routes/whatsapp_multimodal_ia.routes.js` (meta <= 190 linhas)
- [ ] Montar rotas em `routes/index.js`

### Task 3: [Frontend] Módulos UI, Ações e Registro
**Files:**
- Create: `js/modules/whatsapp_multimodal_ia_ui.js`
- Create: `js/modules/whatsapp_multimodal_ia_actions.js`
- Modify: `index.html`

- [ ] Criar `whatsapp_multimodal_ia_ui.js` com console de upload e visualização de OCR/áudio
- [ ] Criar `whatsapp_multimodal_ia_actions.js` com handlers delegados e binds globais
- [ ] Registrar módulos em `index.html` antes de `app.js`

### Task 4: [TDD] Suíte de Testes da Sprint 11.2
**Files:**
- Create: `tests/sprint112_whatsapp_multimodal_voice_ocr_vision.test.cjs`

- [ ] Implementar suíte de testes com testes unitários e de integração
- [ ] Validar áudio -> NLU -> Skill (com verificação de bloqueio RBAC 403 para comandos gerenciais por cliente comum)
- [ ] Validar OCR comprovante PIX com liquidação automática de cobrança e borderô
- [ ] Validar OCR DANFE/NF com trava RBAC 403 para não gerenciais, recálculo CMP e baixa de gargalo
- [ ] Validar OCR Placa/Hodômetro disparando triagem 360º de portaria
- [ ] Validar OCR Peça Condenada registrando item de OS e bloqueio de box
- [ ] Executar suíte: `node --require ./scripts/test-preload.cjs --test tests/sprint112_whatsapp_multimodal_voice_ocr_vision.test.cjs`

### Task 5: [Quality Gates] Verificação Completa e Certificação
- [ ] Gate modular: `node --test tests/modular_file_size_gate.test.cjs`
- [ ] Gate de ações de UI: `node --require ./scripts/test-preload.cjs --test tests/ui_actions_and_bindings_audit.test.cjs`
- [ ] Smoke test do servidor: `node --require ./scripts/test-preload.cjs --test tests/server_smoke_e2e.test.cjs`
- [ ] Atualizar `progress.md`
- [ ] Atualizar manifesto SHA-256: `node scripts/gerar_manifesto_release.cjs`
- [ ] Validar manifesto: `node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs`
- [ ] Suíte completa: `npm test`


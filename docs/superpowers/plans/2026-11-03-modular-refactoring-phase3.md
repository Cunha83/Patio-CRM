# Plano de Refatoração Modular (< 350 linhas): whatsappHandlers & financialAnalystService

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompor os dois arquivos gigantes `services/whatsapp/whatsappHandlers.js` (3.645 linhas) e `services/financialAnalystService.js` (3.389 linhas) em submódulos coesos (< 350 linhas cada) sob as pastas `services/whatsapp/handlers/` e `services/financial/`, mantendo os arquivos originais como Fachadas (Facade / Re-export) para garantir 100% de compatibilidade retroativa e 0 quebra de contratos.

**Architecture:** Facade / Re-export Pattern em Node.js CommonJS. Todos os métodos, helpers e variáveis públicas exportados originalmente continuam sendo exportados por `whatsappHandlers.js` e `financialAnalystService.js`.

**Tech Stack:** Node.js (CommonJS, Built-in Test Runner, Crypto, Tesseract.js).

---

## Estrutura de Arquivos Planejada

### 1. WhatsApp Subsystem (`services/whatsapp/`)
- `services/whatsapp/handlers/whatsappHelpers.js` (< 250 linhas)
  - `formatarMoeda`, `formatarDataBR`, `formatarHoraSimples`, `extrairValorMonetario`, `extrairFormaPagamentoHeuristica`, `extrairOsEPlacaHeuristica`, `extrairTelefoneDeJid`, `isBotPrefix`, `responderMensagem`.
- `services/whatsapp/handlers/whatsappSecurity.js` (< 250 linhas)
  - `rateLimitMap`, `mensagensProcessadas`, `confirmacoesPendentes`, `execucoesEmAndamento`, `verificarRateLimit`, `verificarIdempotencia`, `registrarIdempotencia`, `obterPerfilNumeroWhatsApp`, `podeExecutarEscritaFinanceira`, `podeExecutarEstorno`, `auditarComandoWhatsApp`.
- `services/whatsapp/handlers/whatsappDocumentParser.js` (< 250 linhas)
  - `extrairDadosDocumentoHeuristico`, `analisarDocumentoWhatsApp` (OCR Tesseract e parsing de comprovantes/NFe).
- `services/whatsapp/handlers/whatsappIntakeDispatcher.js` (< 350 linhas)
  - Subfluxo de abertura de OS, triagem técnica por foto/placa e perguntas interativas de garantia.
- `services/whatsapp/handlers/whatsappCommercialDispatcher.js` (< 350 linhas)
  - Subfluxo de consulta de OS, orçamentos, aprovação de orçamento por token e status.
- `services/whatsapp/handlers/whatsappOperationalDispatcher.js` (< 350 linhas)
  - Subfluxo de comandos internos do pátio: `!patio`, `!box`, `!mecanico`, `!pecas`, apontamentos e checklist.
- `services/whatsapp/handlers/whatsappExecutiveDispatcher.js` (< 350 linhas)
  - Subfluxo de comandos de gestão: `!relatorio`, `!caixa`, `!dre`, `!comissao`, `!fechamento` e geração de boletins.
- `services/whatsapp/handlers/whatsappMessageProcessor.js` (< 350 linhas)
  - Orquestrador de roteamento de comandos em texto (`processarMensagemTexto`).
- `services/whatsapp/whatsappHandlers.js` (< 200 linhas)
  - Fachada central: orquestra `tratarMensagemWhatsApp` e reexporta todos os métodos de `module.exports`.

### 2. Financial & Workshop Subsystem (`services/financial/`)
- `services/financial/cashRegisterService.js` (< 350 linhas)
  - Utilitários base (`gerarId`, `arredondar`, `hojeISO`, `agoraISO`, `normalizarFormaPagamento`, `normalizarTipoMovimentacao`), gestão de caixa (`obterCaixaAberto`, `abrirCaixa`, `registrarMovimentacao`, `estornarMovimentacao`, `fecharCaixa`, `projetarMovimentacao`, `projetarCaixa`, `listarMovimentacoes`, `obterResumoFechamentoParcial`).
- `services/financial/billingAndSettlementService.js` (< 350 linhas)
  - Faturamento e saída (`obterResumoFinanceiroOS`, `faturarSaldoOS`, `liquidarTituloFinanceiro`, `validarOuAutorizarSaidaPatioOS`, `gerarTextoCobrancaOS`, `gerarAvisoClienteOS`).
- `services/financial/cashflowAndDREService.js` (< 350 linhas)
  - Demonstrações financeiras (`gerarFluxoDeCaixa`, `gerarPrevisaoFluxoCaixa`, `avaliarControlesInternos`, `formatarParecerExecutivoVerônica`, `exportarMovimentacoesContabeis`, `calcularDRESimplificado`, `calcularDREOperacional`, `formatarBoletimFechamentoWhatsapp`).
- `services/financial/workshopPatioService.js` (< 350 linhas)
  - Operações de boxes, gargalos e peças (`buscarBoxPorIdOuNome`, `listarOcupacaoBoxes`, `alocarBoxOS`, `liberarBoxOS`, `registrarApontamentoPatioOS`, `obterRadarGargalosPatio`, `listarEstoquePecas`, `requisitarPecaOS`, `liberarGargaloPecaOS`, `estornarPecaOS`).
- `services/financial/workshopProductivityService.js` (< 350 linhas)
  - Qualidade e produtividade (`ITENS_CHECKLIST_PADRAO`, `obterChecklistTecnicoOS`, `registrarChecklistTecnicoOS`, `obterHistoricoGarantiaPlaca`, `registrarRetornoGarantiaOS`, `formatarTempoHorasMinutos`, `calcularProdutividadeEComissoes`, `formatarBoletimProdutividadeWhatsapp`, `formatarExtratoComissaoWhatsapp`).
- `services/financialAnalystService.js` (< 150 linhas)
  - Fachada central que reexporta todos os métodos dos submódulos de `services/financial/`.

---

## Tarefas de Execução

### Task 1: Decomposição de `services/whatsapp/whatsappHandlers.js`
- [ ] Criar pasta `services/whatsapp/handlers/`.
- [ ] Extrair `whatsappHelpers.js` (< 250 linhas) e validar sintaxe.
- [ ] Extrair `whatsappSecurity.js` (< 250 linhas) e validar sintaxe.
- [ ] Extrair `whatsappDocumentParser.js` (< 250 linhas) e validar sintaxe.
- [ ] Extrair dispatchers especializados (`whatsappIntakeDispatcher.js`, `whatsappCommercialDispatcher.js`, `whatsappOperationalDispatcher.js`, `whatsappExecutiveDispatcher.js`) com < 350 linhas cada.
- [ ] Extrair `whatsappMessageProcessor.js` (< 350 linhas) com o roteador `processarMensagemTexto`.
- [ ] Refatorar `whatsappHandlers.js` para ser a Fachada (< 200 linhas) reexportando a interface original.
- [ ] Validar linha por linha com `Get-Content ... | Measure-Object -Line` garantindo que nenhum arquivo exceda 350 linhas.
- [ ] **Verificação:** Executar `node --test tests/technical_intake.test.cjs`, `tests/proactive_whatsapp_alerts.test.cjs`, `tests/pre_os.test.cjs`, `tests/inspection_and_quotation.test.cjs`.

### Task 2: Decomposição de `services/financialAnalystService.js`
- [ ] Criar pasta `services/financial/`.
- [ ] Extrair `cashRegisterService.js` (< 350 linhas) e validar sintaxe.
- [ ] Extrair `billingAndSettlementService.js` (< 350 linhas) e validar sintaxe.
- [ ] Extrair `cashflowAndDREService.js` (< 350 linhas) e validar sintaxe.
- [ ] Extrair `workshopPatioService.js` (< 350 linhas) e validar sintaxe.
- [ ] Extrair `workshopProductivityService.js` (< 350 linhas) e validar sintaxe.
- [ ] Refatorar `financialAnalystService.js` para ser a Fachada (< 150 linhas) reexportando todos os 42 métodos públicos.
- [ ] Validar linha por linha com `Get-Content ... | Measure-Object -Line` garantindo que nenhum arquivo exceda 350 linhas.
- [ ] **Verificação:** Executar `node --test tests/assistente_briefing.test.cjs`, `tests/plano_contas_crud.test.cjs`, `tests/menu_novo_compra.test.cjs`, `tests/operational_intelligence.test.cjs`, `tests/metrics.test.cjs`.

### Task 3: Atualização do Manifesto, Validação Global e Commit Semântico
- [ ] Adicionar todos os novos submódulos em `docs/operacao/manifesto_release.json` com seus respectivos SHA-256 e atualizar os hashes de `whatsappHandlers.js` e `financialAnalystService.js`.
- [ ] Rodar `node --require ./scripts/test-preload.cjs --test tests/clean_install_manifest.test.cjs` e garantir aprovação 100%.
- [ ] Executar a suíte completa de testes (`npm test`) e garantir 724+ aprovados, 0 falhas e exit code 0.
- [ ] Verificar `git status --porcelain data/database.json` garantindo integridade e estado limpo.
- [ ] Executar o commit semântico: `refactor(services): modularize whatsappHandlers and financialAnalystService under 350-line ceiling`.
- [ ] Apresentar tabela de contagem de linhas (`wc -l` / `Measure-Object`) e `git status`.

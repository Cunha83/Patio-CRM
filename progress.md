# Pátio-CRM — Histórico e Roadmap de Evolução (Progress)

## Release v2.0.0 Enterprise (Homologada)
- **Data:** 11/11/2026
- **Status:** Produção / Homologado
- **Testes:** 913+ testes passando (0 falhas)
- **Teto Modular:** 100% dos arquivos <= 350 linhas (arquivos críticos <= 280 linhas)

### Fases Concluídas na Versão 2.0.0 Enterprise:
1. **Fase 5 (Comercial B2B & Borderô de Frotas):**
   - Fechamento em lote por frotista com espelho analítico de veículos (cavalo + carreta).
   - Rateio por Centro de Custo e sub-frotas.
   - Emissão de boletos bancários padrão Febraban CNAB com Pix Copia e Cola.
2. **Fase 6 (Pátio, Boxes & Garantias de Linha Pesada):**
   - Gestão de boxes dinâmicos e detecção de gargalos com SLA operacional.
   - Apontamento em tempo real de mecânicos e produtividade comissionada.
   - Checklist técnico de qualidade de suspensão pesada (torque de grampos, pino de centro, embuchamento).
   - Rastreabilidade de retrabalho com expurgo automático de comissão indevida.
3. **Fase 7 (Financeiro Avançado & Inadimplência Frotista):**
   - Conciliação bancária multi-formato (PDF, OFX, CNAB, API).
   - Trava preventiva de crédito e inadimplência centralizada no cliente/frotista.
   - DRE Gerencial Dual (Regime de Competência vs. Regime de Caixa) e Ponto de Equilíbrio (Break-Even).
   - Portal tokenizado de aprovação externa de orçamentos com trilha de auditoria jurídica.
4. **Fase 8 (Preditiva, Fiscal & Prontuário 360º):**
   - Manutenção preventiva preditiva por KM, tempo e severidade de rota.
   - Fechamento fiscal B2B com segregação automática NF-e de peças e NFS-e de serviços com retenções (ISS/IRRF/CSRF).
   - Prontuário técnico 360º do caminhão por placa e eixo com emissão de laudo técnico SHA-256.
5. **Fase 9 (Torre de Controle & Chão de Fábrica):**
   - Torre de Controle Executiva 360º com Score de Saúde Operacional.
   - Terminal operacional de chão de oficina e registro de peças condenadas na desmontagem.
   - Despacho inteligente de mecânicos por matriz de especialidade e turno.
   - Portaria inteligente com Fast Check-in 360º e controle de cancela com trava de checklist.
6. **Fase 10 (Sprint 10.1 - Certificação Arquitetural):**
   - Decomposição cirúrgica de todos os 7 arquivos críticos (330-347 linhas) para <= 280 linhas cada.
   - Zero quebra de contratos públicos (Padrão Fachada / Re-Export em 100% dos módulos).
7. **Fase 10 (Sprint 10.2 - Agente WhatsApp Autônomo & API Bancária Direta):**
   - **Recepção Interativa no WhatsApp (`whatsappReceptionPatioSkill.js`):** Triagem 360º de veículos pesados por placa, pré-check-in com criação automática de OS em box livre, consulta de status/gargalos e geração/envio de link tokenizado de aprovação jurídica para frotistas.
   - **Analista Financeiro no WhatsApp (`whatsappFinancialAnalystSkill.js`):** Consulta de saldos e DRE com RBAC estrito (403 para não autorizados), emissão de cobranças PIX BR Code / Boletos com registro em `paymentCharges`, e conciliação/baixa automática de extratos bancários (PDF, CNAB 240/400, OFX e API) com liquidação de borderôs e desbloqueio em cascata de comissões de mecânicos (`os_recebida`).
   - **Fachada Re-Export do Agente (`whatsappAgentSkillsService.js`):** Decomposta para 99 linhas (<= 200L) com trilha de auditoria completa em `whatsappAgentLogs`.
   - **Conector Direto de API Bancária & Webhook PIX (`bankDirectApiConnectorService.js`):** Sincronização direta de extratos via API bancária segura e processamento de webhooks de liquidação instantânea por `txid`/`nossoNumero`.
   - **Rotas REST e UI Frontend:** 6 endpoints dedicados (`routes/whatsapp_banco_autonomo.routes.js`), modal de painel do agente autônomo e configuração bancária (`whatsapp_agente_autonomo_ui.js` e `whatsapp_agente_autonomo_actions.js`).
   - **Garantia de Qualidade:** 923 testes passando (0 falhas), 100% dos arquivos <= 350 linhas e manifesto de release limpo certificado.
8. **Fase 10 (Sprint 10.3 - Skill Orçamentista Técnico IA & Fechamento de Caixa Diário Auditado):**
   - **Orçamentista Técnico IA no WhatsApp (`whatsappTechnicalQuotationSkill.js`):** Pré-orçamento rápido de peças e serviços de suspensão pesada com proteção de margem piso sobre o Custo Médio Ponderado (CMP), verificação de pronta entrega vs. encomenda, e validação de risco de crédito do cliente (`clienteId`) bloqueando inadimplentes em faturamento a prazo.
   - **Conversão em OS com Reserva de Peças:** Conversão automática de pré-orçamentos em ordens de serviço (`state.os`), gerando reservas de peças disponíveis (`state.partReservations`) e trava `CLIENT_CREDIT_BLOCKED_FOR_QUOTATION` sem override gerencial.
   - **Motor de Fechamento de Caixa Diário (`dailyCashRegisterClosingService.js`):** Apuração analítica em tempo real de entradas por meio de pagamento (PIX, Boleto, Dinheiro, Cartão, Transferência) sem duplicidade de borderôs, saídas por contas pagas, trava de justificativa para divergências físicas (`CASH_DISCREPANCY_JUSTIFICATION_REQUIRED`), carimbo criptográfico SHA-256 e prevenção de duplo fechamento no mesmo dia (`CASH_REGISTER_ALREADY_CLOSED`).
   - **Integração no Agente WhatsApp e Rotas REST:** Intenção de orçamento e fechamento de caixa integrados na fachada (`whatsappAgentSkillsService.js`, 125L), 5 endpoints REST em `routes/whatsapp_orcamentista_caixa.routes.js` e interface/ações frontend dedicadas (`whatsapp_orcamentista_caixa_ui.js` e `actions.js`).
   - **Garantia de Qualidade:** 928 testes passando (0 falhas), 100% dos arquivos <= 350 linhas e manifesto de release atualizado.
9. **Fase 10 (Sprint 10.4 - Skill de Compras & Cotação Automatizada via WhatsApp com Memória de Preços e Regra de Mínimo 3 Fornecedores):**
   - **Memória de Preços e Regra Mínimo 3 Fornecedores (`supplierPriceMemoryHelper.js`):** Consulta histórica de compras anteriores (`state.purchases` / `contasPagar`) com apuração de menor/maior/médio preço e data da última compra. Seleção automática dos melhores fornecedores; caso hajam menos de 3 na memória, gera pergunta interativa em linguagem natural via WhatsApp (`perguntaWhatsAppFornecedorFaltante`) para o operador indicar fornecedores adicionais antes do disparo.
   - **Orquestração de Cotação e Disparo WhatsApp (`whatsappSupplierQuotationSkill.js`):** Abertura de cotação com prazo limite (`validadeHoras`), inclusão interativa de fornecedores complementares (`complementarFornecedoresCotacaoWhatsApp`) e registro instantâneo de propostas recebidas (`registrarPropostaFornecedorWhatsApp`).
   - **Mapa Comparativo Ponderado com Bônus/Penalidade Histórico:** Comparação automática com o histórico da última compra calculando variação percentual. Ponderação configurável entre Modo Econômico (65% Preço + 20% Prazo + 15% Condição) e Modo Urgência de Box (55% Prazo + 35% Preço + 10% Condição), aplicando bônus (+10) para economia e penalidade (-10) para alertas de alta abusiva de preços.
   - **Aprovação e Destravamento de Gargalo de Pátio:** Aprovação da proposta vencedora convertida automaticamente em Pedido de Compra Oficial (`state.purchaseOrders`). Ao registrar o recebimento da NF de compra (`receberNotaFiscalCompraPecas`), encerra automaticamente o gargalo de parada da OS (`aguardando_peca`), liberando o box para status ocupado em produção.
   - **Integração no Agente WhatsApp e Rotas REST:** Roteamento enxuto de intenção de cotação na fachada (`whatsappAgentSkillsService.js`, 146L), 7 endpoints REST dedicados (`routes/whatsapp_compras_cotacoes.routes.js`), modal de cotação de compras e ações delegadas globais (`whatsapp_compras_cotacoes_ui.js` e `actions.js`).
   - **Garantia de Qualidade:** 932+ testes passando (0 falhas), 100% dos arquivos <= 350 linhas e manifesto de release limpo certificado.
10. **Fase 10 (Sprint 10.5 - Cobrança Ativa & Acordos por Cliente, Gateway Real Evolution/Cloud API e Ciclo Autônomo 360º):**
    - **Skill de Cobrança Ativa e Acordo de Dívida (`whatsappCreditRecoverySkill.js`):** Régua automatizada por cliente (`clienteId`) com 4 estágios (`preventivo_d_menos_2`, `atraso_d_mais_1`, `bloqueio_credito_d_mais_5`, `acordo_renegociacao_d_mais_15`). Formalização de acordos de renegociação com entrada mínima de 30% e parcelas futuras em `state.contas`.
    - **Reabilitação Condicional de Crédito:** Ao liquidar a entrada do acordo via `liquidarEntradaAcordoEDesbloquearCreditoCliente`, borderôs e títulos vencidos originais passam para `renegociado_acordo` com saldo zero, reabilitando o crédito do cliente imediatamente no Fast Check-in da Portaria Inteligente (`realizarTriagemPortariaPorPlaca`).
    - **Adaptador para Gateway Real Evolution API / Cloud API (`whatsappGatewayAdapterService.js`):** Validação estrita de assinatura HMAC-SHA256, deduplicação idempotente por `externalMessageId`, fila outbound resiliente com retentativas e Dead Letter Queue (DLQ), e extrator de extratos bancários em PDF/OFX acionando conciliação automática.
    - **Orquestrador do Ciclo Autônomo Diário 360º (`whatsappAutonomousCommandCenterService.js`):** Execução encadeada do Autopilot diário unindo Cobrança Ativa (P1) -> Manutenção Preditiva da Frota (P2) -> Processamento da Fila Outbound (P3) -> Briefing Executivo da Diretoria (P4), gravado em `autonomousCycleLogs`.
    - **Rotas REST e UI Frontend:** 8 endpoints REST em `routes/whatsapp_cobranca_gateway.routes.js`, painel com 3 abas e ações delegadas globais (`whatsapp_cobranca_gateway_ui.js` e `actions.js`).
    - **Garantia de Qualidade:** 939+ testes passando (0 falhas), 100% dos arquivos <= 350 linhas e manifesto de release atualizado.




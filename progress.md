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


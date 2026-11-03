/**
 * services/financialAnalystService.js
 * Fachada principal (Facade / Re-export) do subsistema financeiro e analítico do Pátio-CRM.
 * Garante compatibilidade retroativa total (Zero Breaking Changes) com os contratos públicos.
 * Todas as implementações de domínio residem em submódulos coesos em ./financial/ (< 350 linhas).
 */

const {
  obterCaixaAberto,
  normalizarFormaPagamento,
  normalizarTipoMovimentacao,
  projetarMovimentacao,
  projetarCaixa,
  listarMovimentacoes
} = require('./financial/financialHelpers');

const {
  abrirCaixa,
  registrarMovimentacao,
  fecharCaixa
} = require('./financial/cashRegisterService');

const {
  formatarBoletimFechamentoWhatsapp,
  obterResumoFechamentoParcial
} = require('./financial/cashRegisterBoletimService');

const {
  estornarMovimentacao
} = require('./financial/cashMovementAdjustmentService');

const {
  liquidarTituloFinanceiro
} = require('./financial/titleSettlementService');

const {
  obterResumoFinanceiroOS,
  faturarSaldoOS
} = require('./financial/billingAndSettlementService');

const {
  validarOuAutorizarSaidaPatioOS
} = require('./financial/patioExitAuthorizationService');

const {
  gerarTextoCobrancaOS,
  gerarAvisoClienteOS
} = require('./financial/customerBillingAlertService');

const {
  gerarFluxoDeCaixa,
  gerarPrevisaoFluxoCaixa
} = require('./financial/cashflowAndForecastService');

const {
  avaliarControlesInternos,
  formatarParecerExecutivoVerônica
} = require('./financial/internalAuditAndOpinionService');

const {
  exportarMovimentacoesContabeis,
  calcularDRESimplificado,
  calcularDREOperacional
} = require('./financial/dreAndAccountingService');

const {
  buscarBoxPorIdOuNome,
  listarOcupacaoBoxes,
  alocarBoxOS,
  liberarBoxOS
} = require('./financial/workshopBoxAllocationService');

const {
  registrarApontamentoPatioOS,
  obterRadarGargalosPatio
} = require('./financial/workshopBottleneckRadarService');

const {
  listarEstoquePecas,
  requisitarPecaOS,
  liberarGargaloPecaOS
} = require('./financial/workshopInventoryService');

const {
  estornarPecaOS
} = require('./financial/workshopPartReturnService');

const {
  ITENS_CHECKLIST_PADRAO,
  obterChecklistTecnicoOS,
  registrarChecklistTecnicoOS
} = require('./financial/workshopChecklistService');

const {
  obterHistoricoGarantiaPlaca,
  registrarRetornoGarantiaOS
} = require('./financial/workshopWarrantyService');

const {
  formatarTempoHorasMinutos,
  calcularProdutividadeEComissoes,
  formatarBoletimProdutividadeWhatsapp,
  formatarExtratoComissaoWhatsapp
} = require('./financial/workshopProductivityService');

module.exports = {
  obterCaixaAberto,
  abrirCaixa,
  registrarMovimentacao,
  fecharCaixa,
  gerarFluxoDeCaixa,
  gerarPrevisaoFluxoCaixa,
  avaliarControlesInternos,
  formatarParecerExecutivoVerônica,
  normalizarFormaPagamento,
  normalizarTipoMovimentacao,
  projetarMovimentacao,
  projetarCaixa,
  listarMovimentacoes,
  estornarMovimentacao,
  formatarBoletimFechamentoWhatsapp,
  obterResumoFechamentoParcial,
  obterResumoFinanceiroOS,
  exportarMovimentacoesContabeis,
  faturarSaldoOS,
  liquidarTituloFinanceiro,
  validarOuAutorizarSaidaPatioOS,
  calcularDRESimplificado,
  gerarTextoCobrancaOS,
  listarOcupacaoBoxes,
  alocarBoxOS,
  liberarBoxOS,
  buscarBoxPorIdOuNome,
  registrarApontamentoPatioOS,
  obterRadarGargalosPatio,
  listarEstoquePecas,
  requisitarPecaOS,
  liberarGargaloPecaOS,
  estornarPecaOS,
  calcularDREOperacional,
  gerarAvisoClienteOS,
  ITENS_CHECKLIST_PADRAO,
  obterChecklistTecnicoOS,
  registrarChecklistTecnicoOS,
  obterHistoricoGarantiaPlaca,
  registrarRetornoGarantiaOS,
  formatarTempoHorasMinutos,
  calcularProdutividadeEComissoes,
  formatarBoletimProdutividadeWhatsapp,
  formatarExtratoComissaoWhatsapp
};

/* =====================================================================
   PÁTIO CRM — MÓDULO DE PÁTIO, BOXES & ORDENS DE SERVIÇO (OS)
   Fachada Central e Orquestrador (Padrão Facade / Re-export)
   Submódulos:
   - js/modules/patio_render.js: Renderização visual de boxes e pátio
   - js/modules/patio_os_sheet.js: Folha e drawer lateral de OS
   - js/modules/patio_actions_workflow.js: Faturamento e impressão de OS
   - js/modules/patio_triagem_vistoria.js: Abertura rápida de OS e vistorias
   ===================================================================== */

// Resolução segura de perfil técnico e cartões de pátio
if (typeof isPerfilMecanico === 'undefined') {
  var isPerfilMecanico = (typeof window !== 'undefined' && window.isPerfilMecanico)
    ? window.isPerfilMecanico
    : function () {
        const role = (typeof S !== 'undefined' && S && ((S.user && S.user.role) || S.perfil)) || '';
        if (role === 'mecanico') return true;
        if (role && role !== 'mecanico') return false;
        const perfil = typeof S !== 'undefined' && S && S.ui && S.ui.perfilAtivo;
        return perfil === 'mecanico';
      };
}
if (typeof cardOS === 'undefined' && typeof window !== 'undefined' && window.cardOS) {
  var cardOS = window.cardOS;
}
if (typeof cardLivre === 'undefined' && typeof window !== 'undefined' && window.cardLivre) {
  var cardLivre = window.cardLivre;
}
if (typeof viewPatio === 'undefined' && typeof window !== 'undefined' && window.viewPatio) {
  var viewPatio = window.viewPatio;
}

// Resolução de funções delegadas para compatibilidade universal
var OSatual = (typeof window !== 'undefined' && window.OSatual) || function() {
  if (typeof S === 'undefined' || !S || !S.os) return null;
  return (S.os || []).find(o => o.id === (S.ui && S.ui.osAberta));
};
var folhaOS = (typeof window !== 'undefined' && window.folhaOS) || function() { return ''; };
var abaItens = (typeof window !== 'undefined' && window.abaItens) || function() { return ''; };
var painelPicker = (typeof window !== 'undefined' && window.painelPicker) || function() { return ''; };
var abaFicha = (typeof window !== 'undefined' && window.abaFicha) || function() { return ''; };
var abaHistoricoVeiculo = (typeof window !== 'undefined' && window.abaHistoricoVeiculo) || function() { return ''; };
var abaInspecaoOrcamento = (typeof window !== 'undefined' && window.abaInspecaoOrcamento) || function() { return ''; };
var folhaFaturarOS = (typeof window !== 'undefined' && window.folhaFaturarOS) || function() { return ''; };
var processarFaturamentoOS = (typeof window !== 'undefined' && window.processarFaturamentoOS) || function() {};
var imprimirOS = (typeof window !== 'undefined' && window.imprimirOS) || function() {};
var novaOSFolha = (typeof window !== 'undefined' && window.novaOSFolha) || function() { return ''; };
var folhaNovoVeiculo = (typeof window !== 'undefined' && window.folhaNovoVeiculo) || function() { return ''; };

// Exportações explícitas no escopo global (window e globalThis)
const exportsPatio = {
  isPerfilMecanico,
  cardOS: typeof cardOS !== 'undefined' ? cardOS : undefined,
  cardLivre: typeof cardLivre !== 'undefined' ? cardLivre : undefined,
  viewPatio: typeof viewPatio !== 'undefined' ? viewPatio : undefined,
  OSatual,
  folhaOS,
  abaItens,
  painelPicker,
  abaFicha,
  abaHistoricoVeiculo,
  abaInspecaoOrcamento,
  folhaFaturarOS,
  processarFaturamentoOS,
  imprimirOS,
  novaOSFolha,
  folhaNovoVeiculo
};

if (typeof window !== 'undefined') Object.assign(window, exportsPatio);
if (typeof globalThis !== 'undefined') Object.assign(globalThis, exportsPatio);
if (typeof module !== 'undefined' && module.exports) module.exports = exportsPatio;

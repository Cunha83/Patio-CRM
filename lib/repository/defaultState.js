'use strict';

/**
 * Pátio CRM — Estado Inicial e Sementes Canônicas por Tenant
 * Submódulo extraído de lib/repository/stateRepository.js (< 350 linhas)
 */

function getDefaultState(tenantId = 'default') {
  return {
    versao: 0,
    schemaVersion: 1,
    cfg: {
      empresa: 'Oficina Padrão',
      equipe: { jornadaPadraoHoras: 8 },
      precificacao: {
        margemAlvoPadrao: 35,
        margemMinimaPadrao: 20,
        amostraMinimaHistorico: 5,
        confianca: { mediaMinimo: 5, altaMinimo: 10 },
        protecaoMargem: { modo: 'alertar' },
        margensPorCategoria: {}
      },
      planoDeContas: [
        { id: 'pc_1', codigo: '1', nome: 'Receitas Operacionais', tipo: 'receita', classe: 'sintetica', paiId: null, ativo: true, padrao: true },
        { id: 'pc_1_01', codigo: '1.01', nome: 'Serviços', tipo: 'receita', classe: 'analitica', paiId: 'pc_1', ativo: true, padrao: true },
        { id: 'pc_1_02', codigo: '1.02', nome: 'Peças', tipo: 'receita', classe: 'analitica', paiId: 'pc_1', ativo: true, padrao: true },
        { id: 'pc_2', codigo: '2', nome: 'Custos e Despesas', tipo: 'despesa', classe: 'sintetica', paiId: null, ativo: true, padrao: true },
        { id: 'pc_2_01', codigo: '2.01', nome: 'Pessoal', tipo: 'despesa', classe: 'analitica', paiId: 'pc_2', ativo: true, padrao: true },
        { id: 'pc_2_02', codigo: '2.02', nome: 'Fixas', tipo: 'despesa', classe: 'analitica', paiId: 'pc_2', ativo: true, padrao: true },
        { id: 'pc_2_03', codigo: '2.03', nome: 'Impostos', tipo: 'despesa', classe: 'analitica', paiId: 'pc_2', ativo: true, padrao: true },
        { id: 'pc_2_04', codigo: '2.04', nome: 'Outros', tipo: 'despesa', classe: 'analitica', paiId: 'pc_2', ativo: true, padrao: true }
      ],
      identidadeVisual: {
        logo: null,
        imagemInstitucional: null
      },
      assistente: {
        displayName: 'Verônica',
        voiceGender: 'female',
        enabled: true,
        briefingDiarioAtivo: false,
        briefingDiarioHorario: '07:30',
        briefingDiarioDias: ['segunda', 'terca', 'quarta', 'quinta', 'sexta'],
        briefingSemanalAtivo: false,
        briefingSemanalDia: 'segunda',
        briefingSemanalHorario: '08:00',
        briefingDestinatarios: 'gestores'
      },
      crm: {
        clienteInativoDias: 180,
        alertaKmPercentual: 10,
        alertaDias: 15
      },
      manutencaoPreventiva: {
        alertaDias: 15,
        alertaKm: 1000,
        alertaKmPercentual: 10
      },
      posVenda: {
        enabled: true,
        contatos: [
          { dias: 2, diasAposEntrega: 2, tipo: 'verificacao_servico' },
          { dias: 7, diasAposEntrega: 7, tipo: 'acompanhamento' },
          { dias: 30, diasAposEntrega: 30, tipo: 'relacionamento' }
        ]
      }
    },
    os: [],
    veiculos: [],
    clientes: [],
    boxes: [],
    contas: [],
    pecas: [],
    servicos: [],
    movimentos: [],
    auditoria: [],
    usuarios: [],
    preOS: [],
    intakeSessions: [],
    operationalEvents: [],
    operationalSnapshots: [],
    inspections: [],
    quotations: [],
    inventoryMovements: [],
    partRequirements: [],
    purchaseQuotes: [],
    purchaseOrders: [],
    suppliers: [],
    workers: [],
    laborEntries: [],
    pricingOverrides: [],
    fleets: [],
    maintenancePlans: [],
    opportunities: [],
    appointments: [],
    afterSales: []
  };
}

module.exports = {
  getDefaultState
};

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {
  consultarMemoriaFornecedoresEPrecosItem,
  selecionarFornecedoresMinimoTresOuPerguntar,
  compararPropostaComHistoricoCompras
} = require('../services/inventory/supplierPriceMemoryHelper');

const {
  abrirCotacaoFornecedoresWhatsApp,
  complementarFornecedoresCotacaoWhatsApp,
  registrarPropostaFornecedorWhatsApp,
  apurarMapaComparativoCotacao,
  aprovarPropostaEGerarPedidoCompra,
  executarSkillComprasFornecedoresWhatsApp
} = require('../services/whatsapp/whatsappSupplierQuotationSkill');

const {
  receberNotaFiscalCompraPecas
} = require('../services/inventory/heavyPartsPurchaseOrderService');

function criarEstadoMock() {
  return {
    tenantId: 'tenant_test_104',
    estoque: [
      {
        id: 'peca_grampo_1',
        codigo: 'GRP-001',
        descricao: 'Grampo U 3/4 x 3 x 12',
        quantidade: 1,
        custoMedio: 45.00,
        preco: 75.00
      },
      {
        id: 'peca_feixe_scania',
        codigo: 'FEI-090',
        descricao: 'Feixe de Molas Scania Traseiro',
        quantidade: 0,
        custoMedio: 1200.00,
        preco: 1800.00
      }
    ],
    suppliers: [
      { id: 'forn_1', nome: 'Distribuidora AçoFort', documento: '11.111.111/0001-11', telefone: '11911112222' }
    ],
    purchaseOrders: [
      {
        id: 'po_antigo_1',
        fornecedorNome: 'Distribuidora AçoFort',
        fornecedorDocumento: '11.111.111/0001-11',
        itens: [
          { pecaId: 'peca_grampo_1', codigo: 'GRP-001', descricao: 'Grampo U 3/4 x 3 x 12', custoUnitario: 42.00, quantidade: 10 }
        ],
        criadoEm: '2026-10-15T10:00:00.000Z'
      }
    ],
    supplierQuotations: [],
    whatsappAgentLogs: [],
    os: [],
    partReservations: [],
    patioBoxes: [{ id: 'box_1', nome: 'Box 01 - Pesados', status: 'bloqueado_gargalo', osAtualId: 'os_104_1', gargaloAtivoId: 'gar_peca_104' }],
    patioBottlenecks: [{ id: 'gar_peca_104', osId: 'os_104_1', boxId: 'box_1', motivoParada: 'aguardando_peca', status: 'aberto' }]
  };
}

test('Sprint 10.4 — Task 1: Memória de Últimas Compras e Regra de Mínimo 3 Fornecedores (com Pergunta WhatsApp)', () => {
  const state = criarEstadoMock();

  // Cenário 1: Item possui apenas 1 fornecedor no histórico
  const cotacaoPendente = abrirCotacaoFornecedoresWhatsApp(state, {
    tituloCotacao: 'Cotação Grampos U',
    itens: [{ pecaId: 'peca_grampo_1', quantidade: 4 }],
    minimoFornecedores: 3
  });

  assert.equal(cotacaoPendente.status, 'aguardando_indicacao_fornecedores');
  assert.equal(cotacaoPendente.faltamFornecedoresCount, 2);
  assert.ok(cotacaoPendente.perguntaFornecedorFaltante, 'Deve gerar pergunta para o comprador');
  assert.match(cotacaoPendente.perguntaFornecedorFaltante, /faltam 2 fornecedores/i);

  // Cenário 2: Comprador complementa os 2 fornecedores faltantes
  const cotacaoAtualizada = complementarFornecedoresCotacaoWhatsApp(state, cotacaoPendente.id, {
    novosFornecedores: [
      { nome: 'Molas Brasil Peças', telefone: '11988887777' },
      { nome: 'Centro Peças Pesadas', telefone: '11977776666' }
    ]
  });

  assert.equal(cotacaoAtualizada.ok, true);
  assert.equal(cotacaoAtualizada.cotacao.status, 'aguardando_propostas');
  assert.equal(cotacaoAtualizada.cotacao.fornecedoresConvidados.length, 3);
  assert.equal(cotacaoAtualizada.cotacao.faltamFornecedoresCount, 0);

  // Cenário 3: Item com 3 fornecedores prévios dispara automaticamente
  state.purchaseOrders.push(
    {
      id: 'po_antigo_2',
      fornecedorNome: 'Molas Brasil Peças',
      itens: [{ pecaId: 'peca_feixe_scania', custoUnitario: 1150.00, quantidade: 2 }],
      criadoEm: '2026-10-20T10:00:00.000Z'
    },
    {
      id: 'po_antigo_3',
      fornecedorNome: 'Centro Peças Pesadas',
      itens: [{ pecaId: 'peca_feixe_scania', custoUnitario: 1180.00, quantidade: 1 }],
      criadoEm: '2026-10-22T10:00:00.000Z'
    },
    {
      id: 'po_antigo_4',
      fornecedorNome: 'Distribuidora AçoFort',
      itens: [{ pecaId: 'peca_feixe_scania', custoUnitario: 1200.00, quantidade: 1 }],
      criadoEm: '2026-10-25T10:00:00.000Z'
    }
  );

  const cotacaoAuto = abrirCotacaoFornecedoresWhatsApp(state, {
    tituloCotacao: 'Cotação Feixes Scania',
    itens: [{ pecaId: 'peca_feixe_scania', quantidade: 2 }],
    minimoFornecedores: 3
  });

  assert.equal(cotacaoAuto.status, 'aguardando_propostas');
  assert.equal(cotacaoAuto.fornecedoresConvidados.length, 3);
  assert.equal(cotacaoAuto.faltamFornecedoresCount, 0);
});

test('Sprint 10.4 — Task 2: Auditoria vs Última Compra e Mapa Comparativo (Econômico vs Urgência)', () => {
  const state = criarEstadoMock();

  const cotacao = abrirCotacaoFornecedoresWhatsApp(state, {
    tituloCotacao: 'Cotação Grampos U',
    itens: [{ pecaId: 'peca_grampo_1', quantidade: 10 }],
    fornecedoresConvidados: [
      { nome: 'Distribuidora AçoFort', telefone: '11911112222' },
      { nome: 'Molas Brasil', telefone: '11988887777' },
      { nome: 'Centro Peças', telefone: '11977776666' }
    ]
  });

  // Proposta 1: R$ 38,00/un (Total 380) vs última compra R$ 42,00 (Total 420) -> Economia
  const prop1 = registrarPropostaFornecedorWhatsApp(state, cotacao.id, {
    fornecedorNome: 'Distribuidora AçoFort',
    valorTotalOfertado: 380.00,
    prazoEntregaHoras: 48,
    prazoMedioDias: 30
  });
  assert.equal(prop1.proposta.analiseHistoricoCompras.statusComparativoHistorico, 'economia_abaixo_ultima_compra');
  assert.ok(prop1.proposta.analiseHistoricoCompras.variacaoPercentualVsUltimaCompra < 0);

  // Proposta 2: R$ 46,00/un (Total 460) vs última compra R$ 42,00 (Total 420) -> Alerta aumento
  const prop2 = registrarPropostaFornecedorWhatsApp(state, cotacao.id, {
    fornecedorNome: 'Molas Brasil',
    valorTotalOfertado: 460.00,
    prazoEntregaHoras: 2, // Entrega ultra rápida
    prazoMedioDias: 15
  });
  assert.equal(prop2.proposta.analiseHistoricoCompras.statusComparativoHistorico, 'alerta_aumento_acima_historico');

  // Mapa Comparativo em Modo Econômico -> AçoFort vence por menor preço
  const mapaEco = apurarMapaComparativoCotacao(state, cotacao.id, { prioridadeUrgenciaBoxOverride: false });
  assert.equal(mapaEco.modoUrgenciaAtivo, false);
  assert.equal(mapaEco.propostaRecomendada.fornecedorNome, 'Distribuidora AçoFort');

  // Mapa Comparativo em Modo Urgência de Box -> Molas Brasil vence por prazo 2h
  const mapaUrgente = apurarMapaComparativoCotacao(state, cotacao.id, { prioridadeUrgenciaBoxOverride: true });
  assert.equal(mapaUrgente.modoUrgenciaAtivo, true);
  assert.equal(mapaUrgente.propostaRecomendada.fornecedorNome, 'Molas Brasil');
});

test('Sprint 10.4 — Task 3: Ciclo Ponta a Ponta (Aprovação -> Pedido de Compra -> Recebimento NF -> Box Destravado)', () => {
  const state = criarEstadoMock();

  state.os.push({
    id: 'os_104_1',
    num: 1041,
    status: 'em_andamento',
    gargalo: 'aguardando_peca',
    pecas: [{ pecaId: 'peca_grampo_1', quantidade: 4, descricao: 'Grampo U' }]
  });

  const cotacao = abrirCotacaoFornecedoresWhatsApp(state, {
    tituloCotacao: 'Cotação Grampos OS 1041',
    osVinculadaId: 'os_104_1',
    gargaloVinculadoId: 'aguardando_peca',
    itens: [{ pecaId: 'peca_grampo_1', quantidade: 4 }],
    forcarDisparoComMenosDeTres: true
  });

  registrarPropostaFornecedorWhatsApp(state, cotacao.id, {
    fornecedorNome: 'Distribuidora AçoFort',
    valorTotalOfertado: 160.00,
    prazoEntregaHoras: 24
  });

  // Aprovação gerando Pedido de Compra
  const aprovacao = aprovarPropostaEGerarPedidoCompra(state, cotacao.id);
  assert.equal(aprovacao.ok, true);
  assert.ok(aprovacao.pedidoCompra.id);
  assert.equal(aprovacao.cotacao.status, 'aprovada_pedido_gerado');

  // Dupla aprovação bloqueada
  assert.throws(() => {
    aprovarPropostaEGerarPedidoCompra(state, cotacao.id);
  }, (err) => {
    assert.equal(err.code, 'QUOTATION_ALREADY_APPROVED');
    return true;
  });

  // Recebimento da NF desfaz o gargalo da OS e do Box
  const resNF = receberNotaFiscalCompraPecas(state, aprovacao.pedidoCompra.id, {
    numeroNF: 'NF-10499',
    valorTotalNota: 160.00
  });

  assert.equal(resNF.ok, true);
  const boxAtualizado = state.patioBoxes.find(b => b.osAtualId === 'os_104_1');
  assert.equal(boxAtualizado.gargaloAtivoId, null, 'Gargalo do Box deve ser encerrado');
  assert.equal(boxAtualizado.status, 'ocupado', 'Box deve voltar a ficar ocupado');
});

test('Sprint 10.4 — Task 4: Rotas REST e Componentes de UI/Actions', () => {
  const routesPath = path.resolve(__dirname, '../routes/whatsapp_compras_cotacoes.routes.js');
  const uiPath = path.resolve(__dirname, '../js/modules/whatsapp_compras_cotacoes_ui.js');
  const actionsPath = path.resolve(__dirname, '../js/modules/whatsapp_compras_cotacoes_actions.js');

  assert.ok(fs.existsSync(routesPath), 'routes/whatsapp_compras_cotacoes.routes.js deve existir');
  assert.ok(fs.existsSync(uiPath), 'whatsapp_compras_cotacoes_ui.js deve existir');
  assert.ok(fs.existsSync(actionsPath), 'whatsapp_compras_cotacoes_actions.js deve existir');

  const mockGlobal = {
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      querySelector: () => null
    },
    app: { toast: () => {} }
  };
  mockGlobal.window = mockGlobal;
  mockGlobal.globalThis = mockGlobal;

  vm.runInNewContext(fs.readFileSync(uiPath, 'utf8'), mockGlobal);
  vm.runInNewContext(fs.readFileSync(actionsPath, 'utf8'), mockGlobal);

  assert.equal(typeof mockGlobal.renderPainelCotacoesFornecedoresWhatsAppHtml, 'function');
  assert.equal(typeof mockGlobal.modalAbrirCotacaoFornecedoresHtml, 'function');
  assert.equal(typeof mockGlobal.modalComplementarFornecedoresHtml, 'function');
  assert.equal(typeof mockGlobal.abrirModalNovaCotacaoWhatsApp, 'function');
  assert.equal(typeof mockGlobal.abrirModalComplementarFornecedores, 'function');
});

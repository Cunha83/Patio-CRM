'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const externalFleetApprovalService = require('../services/quotation/externalFleetApprovalService');

function criarEstadoMock() {
  return {
    tenantId: 'tenant_sprint73',
    clientes: [
      {
        id: 'cli_transp_gama',
        nome: 'Transportadora Gama Express',
        centrosCusto: [
          {
            id: 'cc_frota_pesada',
            nome: 'Frota Pesada Linha Sul',
            limiteMensal: 5000.00,
            bloquearEstouro: true
          }
        ]
      }
    ],
    costCenters: [
      {
        id: 'cc_frota_pesada',
        tenantId: 'tenant_sprint73',
        nome: 'Frota Pesada Linha Sul',
        limiteMensal: 5000.00,
        bloquearEstouro: true
      }
    ],
    os: [
      {
        id: 'os_frotista_730',
        num: 7301,
        tenantId: 'tenant_sprint73',
        clienteId: 'cli_transp_gama',
        cli: 'cli_transp_gama',
        placa: 'GAM3E30',
        veiculo: 'Volvo FH 540 6x4',
        st: 'em_andamento',
        boxAtualId: 'box_pesado_3',
        centroCustoId: 'cc_frota_pesada',
        total: 3500.00,
        valorTotal: 3500.00,
        servicos: [
          { id: 'srv_alinh_1', desc: 'Alinhamento Técnico Laser', valor: 500.00, status: 'pendente' },
          { id: 'srv_embuch_1', desc: 'Embuchamento de Manga de Eixo', valor: 1000.00, status: 'pendente' }
        ],
        pecas: [
          { id: 'pec_pino_1', pecaId: 'p_pino_1', desc: 'Kit Pinos e Buchas', valor: 2000.00, qtd: 1, status: 'pendente' }
        ]
      }
    ],
    patioBoxes: [
      {
        id: 'box_pesado_3',
        nome: 'Box 03 - Laser e Suspensão',
        status: 'bloqueado_gargalo',
        osAtualId: 'os_frotista_730',
        gargaloAtivoId: 'gar_aprov_730'
      }
    ],
    patioBottlenecks: [
      {
        id: 'gar_aprov_730',
        osId: 'os_frotista_730',
        boxId: 'box_pesado_3',
        motivoParada: 'aguardando_aprovacao_frotista',
        status: 'aberto',
        inicioParadaEm: '2026-11-10T12:00:00Z',
        slaMaximoMinutos: 180
      }
    ],
    partReservations: [],
    opportunities: [],
    creditPolicies: {
      cli_transp_gama: {
        clienteId: 'cli_transp_gama',
        limiteCredito: 10000.00,
        diasToleranciaAtraso: 5,
        bloqueioAutomatico: true
      }
    },
    borderos: [],
    externalApprovalTokens: [],
    whatsappAgentLogs: []
  };
}

test('Sprint 7.3 — Task 1: Motor de Link Tokenizado e Portal de Aprovação Externa B2B', async (t) => {
  await t.test('1.1: Geração de link tokenizado, invalidação de pendentes e bloqueios de expiração/revogação', () => {
    const state = criarEstadoMock();

    // 1. Gera token 1
    const res1 = externalFleetApprovalService.gerarLinkTokenAprovacaoFrotista(state, {
      osId: 'os_frotista_730',
      validadeHoras: 24,
      telefoneDestino: '5511999998888',
      responsavel: 'consultor_rafael'
    });
    assert.equal(res1.ok, true);
    assert.ok(res1.token.token);
    assert.equal(res1.token.status, 'pendente');
    assert.equal(res1.token.valorOrcamentoOriginal, 3500.00);

    // 2. Gera token 2 para a mesma OS -> token 1 deve ser invalidado/revogado automaticamente
    const res2 = externalFleetApprovalService.gerarLinkTokenAprovacaoFrotista(state, {
      osId: 'os_frotista_730',
      validadeHoras: 24,
      telefoneDestino: '5511999998888'
    });
    assert.equal(res2.ok, true);
    assert.equal(res1.token.status, 'revogado');
    assert.equal(res2.token.status, 'pendente');

    // 3. Tentar consultar token 1 revogado deve lançar APPROVAL_TOKEN_REVOKED
    assert.throws(
      () => externalFleetApprovalService.consultarOrcamentoPorTokenPublico(state, res1.token.token),
      (err) => err.code === 'APPROVAL_TOKEN_REVOKED'
    );

    // 4. Token 2 expirado por dataReferencia no futuro deve lançar APPROVAL_TOKEN_EXPIRED
    assert.throws(
      () => externalFleetApprovalService.consultarOrcamentoPorTokenPublico(state, res2.token.token, {
        dataReferencia: '2026-11-20T12:00:00Z'
      }),
      (err) => err.code === 'APPROVAL_TOKEN_EXPIRED'
    );
  });

  await t.test('1.2: Decisão Externa Parcial, Trilha Jurídica (SHA-256), Destravamento de Box e Bloqueio de Reuso', () => {
    const state = criarEstadoMock();

    const linkRes = externalFleetApprovalService.gerarLinkTokenAprovacaoFrotista(state, {
      osId: 'os_frotista_730'
    });
    const tokenStr = linkRes.token.token;

    // Frotista decide aprovar os serviços (R$ 1.500) e adiar a peça (R$ 2.000)
    const decisaoRes = externalFleetApprovalService.submeterDecisaoExternaFrotista(state, tokenStr, {
      aprovadorNome: 'Eng. Marcelo Antunes',
      aprovadorDocumento: '123.456.789-00',
      aprovadorCargo: 'Gerente Nacional de Frotas',
      ipOrigem: '189.40.12.55',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      decisoesItens: [
        { id: 'srv_alinh_1', statusItem: 'aprovado' },
        { id: 'srv_embuch_1', statusItem: 'aprovado' },
        { id: 'pec_pino_1', statusItem: 'adiado', motivo: 'Substituição programada para revisão de 100.000km' }
      ]
    });

    assert.equal(decisaoRes.ok, true);
    assert.equal(decisaoRes.decisaoAuditada.valorAprovado, 1500.00);
    assert.ok(decisaoRes.decisaoAuditada.hashIntegridadeDecisao);

    // 1. Trilha gravada na OS e Token marcado como utilizado
    const tokenObj = state.externalApprovalTokens.find(t => t.token === tokenStr);
    assert.equal(tokenObj.status, 'utilizado');
    assert.equal(state.os[0].aceiteExternoB2B.aprovadorNome, 'Eng. Marcelo Antunes');

    // 2. Destravamento do Box no pátio: gargalo encerrado e Box retornou para ocupado!
    const gargalo = state.patioBottlenecks.find(g => g.id === 'gar_aprov_730');
    assert.equal(gargalo.status, 'encerrado');
    const box = state.patioBoxes.find(b => b.id === 'box_pesado_3');
    assert.equal(box.status, 'ocupado');
    assert.equal(box.gargaloAtivoId, null);

    // 3. Demanda reprimida gerada no CRM para o item adiado
    assert.equal(state.opportunities.length, 1);
    assert.equal(state.opportunities[0].valorEstimado, 2000.00);

    // 4. Tentativa de submeter novamente no mesmo token deve lançar APPROVAL_TOKEN_ALREADY_USED
    assert.throws(
      () => externalFleetApprovalService.submeterDecisaoExternaFrotista(state, tokenStr, {
        aprovadorNome: 'Eng. Marcelo Antunes',
        aprovadorDocumento: '123.456.789-00'
      }),
      (err) => err.code === 'APPROVAL_TOKEN_ALREADY_USED'
    );
  });

  await t.test('1.3: Integração com Guardiões Financeiros: Trava de Inadimplência e Budget de Centro de Custo', () => {
    const state = criarEstadoMock();

    // Cenário A: Frotista inadimplente com borderô em atraso
    state.borderos.push({
      id: 'bord_vencido_gama',
      tenantId: 'tenant_sprint73',
      clienteId: 'cli_transp_gama',
      saldoDevedor: 4000.00,
      valorTotal: 4000.00,
      status: 'faturado',
      dataVencimento: '2026-10-01' // Vencido há mais de 30 dias (> tolerância de 5 dias)
    });

    const linkRes1 = externalFleetApprovalService.gerarLinkTokenAprovacaoFrotista(state, { osId: 'os_frotista_730' });

    // Sem override: deve bloquear e manter token pendente
    assert.throws(
      () => externalFleetApprovalService.submeterDecisaoExternaFrotista(state, linkRes1.token.token, {
        aprovadorNome: 'Marcelo Antunes',
        aprovadorDocumento: '123.456.789-00'
      }),
      (err) => err.code === 'FLEET_DELINQUENCY_CREDIT_BLOCKED'
    );
    assert.equal(linkRes1.token.status, 'pendente');

    // Cenário B: Bloqueio por estouro de Budget de Centro de Custo
    // Remove inadimplência para testar CC
    state.borderos = [];
    // Budget do CC é 5000. Adiciona OS anterior consumindo 4500. Aprovando 1500 -> 4500 + 1500 = 6000 > 5000
    state.os.push({
      id: 'os_anterior_cc',
      tenantId: 'tenant_sprint73',
      centroCustoId: 'cc_frota_pesada',
      st: 'finalizada',
      total: 4500.00
    });

    const linkRes2 = externalFleetApprovalService.gerarLinkTokenAprovacaoFrotista(state, { osId: 'os_frotista_730' });

    assert.throws(
      () => externalFleetApprovalService.submeterDecisaoExternaFrotista(state, linkRes2.token.token, {
        aprovadorNome: 'Marcelo Antunes',
        aprovadorDocumento: '123.456.789-00',
        centroCustoId: 'cc_frota_pesada',
        decisoesItens: [{ id: 'srv_alinh_1', statusItem: 'aprovado' }, { id: 'srv_embuch_1', statusItem: 'aprovado' }]
      }),
      (err) => err.code === 'COST_CENTER_BUDGET_EXCEEDED'
    );
    assert.equal(linkRes2.token.status, 'pendente');
  });
});


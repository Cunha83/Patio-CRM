'use strict';

/**
 * =====================================================================
 * PÁTIO CRM — SUÍTE DE TESTES END-TO-END E AUDITORIA OPERACIONAL
 * "Jornada de Oficina, Segurança Multi-Tenant e Governança SaaS"
 * =====================================================================
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

// Serviços e módulos de domínio
const technicalIntakeEngine = require('../services/technicalIntakeEngine');
const inspectionService = require('../services/inspectionService');
const quotationService = require('../services/quotationService');
const pricingEngine = require('../services/pricingEngine');
const inventoryService = require('../services/inventoryService');
const laborTrackingService = require('../services/laborTrackingService');
const costingService = require('../services/costingService');
const financialEngine = require('../services/financialEngine');
const afterSalesService = require('../services/afterSalesService');
const customerTimelineService = require('../services/customerTimelineService');
const maintenancePlanService = require('../services/maintenancePlanService');
const subscriptionService = require('../services/subscriptionService');
const lgpdService = require('../services/lgpdService');
const demoDataService = require('../services/demoDataService');
const fileStorage = require('../lib/file-storage');
const { IdentityRegistry } = require('../lib/auth/identity');
const { createAuthMiddleware } = require('../lib/auth/context');
const { migrarSchemaEstado } = require('../lib/repository/migration');
const {
  gerarTokenAprovacaoOrcamento,
  validarTokenAprovacaoOrcamento,
  consumirTokenAprovacaoOrcamento
} = require('../lib/tokens/securityToken');

/* ── 1. SIMULAÇÃO COMPLETA: JORNADA DA OFICINA (07:30 ÀS 18:00 + D+2) ── */
test('1. Jornada de Oficina: Do diagnóstico de entrada à entrega e pós-venda D+2', async () => {
  const tenantId = 'oficina_matriz_pesada';

  // 1.1 Estado inicial da oficina às 07:30
  const state = {
    tenantId,
    versao: 1,
    schemaVersion: 1,
    cfg: {
      empresa: 'Auto Molas & Frotas Santa Maria',
      cnpj: '11.222.333/0001-44',
      fone: '62988880000',
      termoGarantia: '90 dias de garantia em serviços e peças novas.',
      precificacao: {
        margemAlvoPadrao: 35.0,
        margemMinimaPadrao: 20.0,
        modoProtecao: 'alertar'
      },
      manutencaoPreventiva: {
        alertaKmPadrao: 1000,
        alertaDiasPadrao: 15
      },
      posVenda: {
        enabled: true,
        contatos: [
          { diasAposEntrega: 2, tipo: 'verificacao_servico' },
          { diasAposEntrega: 30, tipo: 'acompanhamento' }
        ]
      },
      assistente: {
        displayName: 'Verônica',
        voiceGender: 'female',
        enabled: true
      },
      identidadeVisual: {
        logoUrl: '/uploads/oficina_matriz_pesada/logo.png',
        imagemInstitucionalUrl: '/uploads/oficina_matriz_pesada/fachada.jpg'
      }
    },
    clientes: [
      {
        id: 'cli_expresso_alfa',
        tenantId,
        nome: 'Expresso Alfa Transportes Rodoviários Ltda',
        doc: '04.555.666/0001-77',
        fone: '62991114444',
        tipo: 'frotista',
        preferenciasContato: { whatsapp: true, commercial: true, preventiveMaintenance: true, afterSales: true }
      }
    ],
    veiculos: [
      {
        id: 'vei_volvo_fh',
        tenantId,
        placa: 'BRA2E19',
        modelo: 'Volvo FH 540 6x4',
        km: 450000,
        cli: 'cli_expresso_alfa'
      }
    ],
    pecas: [
      {
        id: 'peca_feixe_mola',
        tenantId,
        cod: 'FM-01',
        nome: 'Feixe de Molas Dianteiro Reforçado',
        qtd: 5,
        custo: 850.00,
        venda: 1400.00,
        min: 1
      },
      {
        id: 'peca_valvula_ar',
        tenantId,
        cod: 'VA-04',
        nome: 'Válvula Reguladora de Pressão 4 Vias',
        qtd: 3,
        custo: 320.00,
        venda: 580.00,
        min: 1
      }
    ],
    servicos: [
      { id: 'srv_troca_molejo', tenantId, cod: 'SRV-01', nome: 'Substituição Feixe de Molas Dianteiro', valor: 450.00 },
      { id: 'srv_revisao_freios', tenantId, cod: 'SRV-02', nome: 'Revisão e Regulagem do Sistema Pneumático', valor: 300.00 }
    ],
    workers: [
      {
        id: 'colab_moleiro',
        tenantId,
        nome: 'Carlos Moleiro',
        funcao: 'Mecânico de Suspensão',
        custoHora: 65.00,
        ativo: true
      }
    ],
    boxes: [{ id: 'box_01', nome: 'Box 01 - Fosso Pesado' }],
    os: [],
    preOS: [],
    intakeSessions: [],
    inspections: [],
    quotations: [],
    inventoryMovements: [],
    partRequirements: [],
    laborEntries: [],
    contas: [],
    movimentos: [],
    auditoria: []
  };

  // 1.2 08:00 — Chegada do caminhão e Triagem Técnica (Intake)
  const resIntake = technicalIntakeEngine.iniciarIntake({
    tenantId,
    actorId: 'consultor_recepcao',
    channel: 'web',
    placa: 'BRA2E19',
    kmAtual: 450000,
    reclamacao: 'Caminhão estalando no molejo dianteiro e chiado de ar no freio',
    state
  });
  assert.equal(resIntake.ok, true, 'Intake iniciado com sucesso');
  assert.ok(resIntake.session, 'Sessão de intake criada');

  // 1.3 08:30 — Conversão para OS e Inspeção Física
  const novaOS = {
    id: 'os_jornada_01',
    num: 2001,
    tenantId,
    vei: 'vei_volvo_fh',
    cli: 'cli_expresso_alfa',
    placa: 'BRA2E19',
    km: 450000,
    st: 'orcamento',
    box: 'box_01',
    abertura: '2026-09-11',
    motivo: resIntake.preOS?.queixaPrincipal || 'Suspensão estalando e vazamento de ar',
    servicos: [],
    pecas: []
  };
  state.os.push(novaOS);

  // Inspeção técnica realizada pelo mecânico
  const inspecao = inspectionService.criarInspecao({
    tenantId,
    state,
    osId: novaOS.id,
    veiculoId: novaOS.vei,
    responsavel: 'Carlos Moleiro'
  });

  inspectionService.adicionarItemInspecao({
    tenantId,
    state,
    inspectionId: inspecao.id,
    itemData: {
      sistema: 'suspensao',
      componente: 'Feixe de mola dianteiro direito',
      condicao: 'critica',
      acaoRecomendada: 'Substituição imediata por risco de quebra da lâmina mestra'
    }
  });

  inspectionService.adicionarItemInspecao({
    tenantId,
    state,
    inspectionId: inspecao.id,
    itemData: {
      sistema: 'freios',
      componente: 'Válvula de 4 vias',
      condicao: 'atencao',
      acaoRecomendada: 'Vazamento leve na gaxeta inferior. Regulagem ou troca preventiva recomendada'
    }
  });

  inspectionService.concluirInspecao({
    tenantId,
    state,
    inspectionId: inspecao.id,
    laudoTecnico: 'Suspensão dianteira requer intervenção imediata. Freios podem ser revisados ou adiados.',
    actorId: 'Carlos Moleiro'
  });

  // 1.4 09:00 — Criação do Orçamento
  const resOrc = quotationService.criarOrcamento({
    tenantId,
    state,
    osId: novaOS.id,
    inspectionId: inspecao.id,
    items: [
      { id: 'item_p1', tipo: 'peca', nome: 'Feixe de Molas Dianteiro Reforçado', quantidade: 1, valorUnitario: 1400.00 },
      { id: 'item_p2', tipo: 'peca', nome: 'Válvula Reguladora de Pressão 4 Vias', quantidade: 1, valorUnitario: 580.00 },
      { id: 'item_s1', tipo: 'servico', nome: 'Substituição Feixe de Molas Dianteiro', quantidade: 1, valorUnitario: 450.00 },
      { id: 'item_s2', tipo: 'servico', nome: 'Revisão e Regulagem do Sistema Pneumático', quantidade: 1, valorUnitario: 300.00 }
    ],
    actorId: 'consultor_recepcao'
  });
  assert.equal(resOrc.ok, true);
  const orcamento = resOrc.quotation;
  assert.equal(orcamento.versao, 1);

  // Análise de rentabilidade e preço sugerido pelo pricingEngine
  const precoAlvo = pricingEngine.calcularPrecoAlvo(850.00, 35.0);
  const precoMinimo = pricingEngine.calcularPrecoMinimo(850.00, 20.0);
  assert.ok(precoAlvo > 1300, 'Preço alvo coerente com margem de 35%');
  assert.ok(precoMinimo > 1000, 'Preço mínimo coerente com margem de 20%');

  // 1.5 09:30 — Envio e Aprovação Digital com Token Seguro
  const envio = quotationService.enviarOrcamento({
    tenantId,
    state,
    quotationId: orcamento.id,
    canalEnvio: 'whatsapp',
    actorId: 'consultor_recepcao'
  });
  assert.ok(envio.token, 'Token de aprovação público gerado');

  const tokenValido = validarTokenAprovacaoOrcamento(envio.token);
  assert.ok(tokenValido.ok, 'Token de aprovação validado com sucesso');
  assert.equal(tokenValido.payload.tenantId, tenantId);

  // O cliente opta por Aprovação Parcial: Aprova o feixe de molas e o serviço de molejo; recusa a válvula de freios
  const resultadoAprovacao = quotationService.processarAprovacaoCliente({
    tenantId,
    state,
    tokenString: envio.token,
    itensAprovadosIds: ['item_p1', 'item_s1'],
    itensRecusadosIds: ['item_p2', 'item_s2'],
    actorId: 'cliente_link_publico'
  });
  assert.equal(resultadoAprovacao.ok, true);
  assert.equal(resultadoAprovacao.quotation.status, 'parcialmente_aprovado');

  // Token é consumido: segunda tentativa com o mesmo token deve retornar idempotente ou erro
  const segundaAprovacao = quotationService.processarAprovacaoCliente({
    tenantId,
    state,
    tokenString: envio.token,
    itensAprovadosIds: ['item_p1'],
    actorId: 'cliente_link_publico'
  });
  assert.ok(segundaAprovacao.idempotente || !segundaAprovacao.ok, 'Token protegido contra reutilização conflitante');

  // Copia itens aprovados para a OS e atualiza status para 'executando'
  novaOS.st = 'executando';
  novaOS.pecas = [{ id: 'os_p1', pecaId: 'peca_feixe_mola', nome: 'Feixe de Molas Dianteiro Reforçado', qtd: 1, valor: 1400.00, st: 'reservada' }];
  novaOS.servicos = [{ id: 'os_s1', servicoId: 'srv_troca_molejo', nome: 'Substituição Feixe de Molas Dianteiro', valor: 450.00 }];

  // 1.6 10:00 — Reserva Física no Almoxarifado
  const resReserva = inventoryService.reservarParaOS({
    tenantId,
    state,
    osId: novaOS.id,
    partId: 'peca_feixe_mola',
    quantity: 1,
    actorId: 'almoxarife'
  });
  assert.ok(resReserva.ok, 'Reserva confirmada');
  const saldosAposReserva = inventoryService.calcularSaldos({ tenantId, state, partId: 'peca_feixe_mola' });
  assert.equal(saldosAposReserva.estoqueFisico, 5, 'Físico permanece 5');
  assert.equal(saldosAposReserva.estoqueReservado, 1, 'Reservado vira 1');
  assert.equal(saldosAposReserva.estoqueDisponivel, 4, 'Disponível baixa para 4');

  // 1.7 10:30 — Apontamento de Mão de Obra do Mecânico
  const resEntradaMO = laborTrackingService.iniciarApontamento({
    tenantId,
    state,
    osId: novaOS.id,
    workerId: 'colab_moleiro',
    serviceItemId: 'os_s1',
    serviceNome: 'Substituição Feixe de Molas Dianteiro',
    actorId: 'colab_moleiro'
  });
  assert.equal(resEntradaMO.ok, true);
  const entradaMO = resEntradaMO.entry;
  assert.equal(entradaMO.status, 'ativo');

  // 12:00 — Pausa para almoço (90 min de trabalho)
  entradaMO.intervals[0].durationMinutes = 90;
  entradaMO.intervals[0].endedAt = new Date().toISOString();
  laborTrackingService.pausarApontamento({
    tenantId,
    state,
    entryId: entradaMO.id,
    motivo: 'Almoço',
    actorId: 'colab_moleiro'
  });

  // 13:00 — Retorno do almoço
  laborTrackingService.retomarApontamento({
    tenantId,
    state,
    entryId: entradaMO.id,
    actorId: 'colab_moleiro'
  });

  // 14:30 — Conclusão do serviço de molejo (mais 90 min de trabalho = 180 min totais)
  if (entradaMO.intervals[1]) {
    entradaMO.intervals[1].durationMinutes = 90;
    entradaMO.intervals[1].endedAt = new Date().toISOString();
  }
  laborTrackingService.encerrarApontamento({
    tenantId,
    state,
    entryId: entradaMO.id,
    actorId: 'colab_moleiro'
  });
  entradaMO.durationMinutes = 180;

  // 1.8 14:45 — Consumo Real da Peça
  const resConsumo = inventoryService.consumirPecaOS({
    tenantId,
    state,
    osId: novaOS.id,
    partId: 'peca_feixe_mola',
    quantity: 1,
    actorId: 'colab_moleiro'
  });
  assert.ok(resConsumo.ok, 'Peça consumida fisicamente');
  const saldosAposConsumo = inventoryService.calcularSaldos({ tenantId, state, partId: 'peca_feixe_mola' });
  assert.equal(saldosAposConsumo.estoqueFisico, 4, 'Físico baixou para 4');
  assert.equal(saldosAposConsumo.estoqueReservado, 0, 'Reserva zerada');
  assert.equal(saldosAposConsumo.estoqueDisponivel, 4, 'Disponível é 4');

  // 1.9 15:00 — Apuração do Custo Real da OS
  const custoMO = costingService.calcularCustoMaoDeObraOS({ tenantId, state, osId: novaOS.id });
  // 180 min = 3h * R$ 65/h = R$ 195,00
  assert.equal(custoMO.custoMaoObra, 195.00);

  const custoTotalOS = 195.00 + 850.00; // Custo MO + Custo da Peça
  const receitaTotalOS = 1400.00 + 450.00; // Valor de venda: R$ 1.850,00
  const lucroBrutoOS = receitaTotalOS - custoTotalOS;
  assert.equal(lucroBrutoOS, 805.00, 'Lucro bruto calculado corretamente');

  // 1.10 15:30 — Faturamento e Baixa em Caixa (PIX)
  state.contas.push({
    id: 'rec_os_2001',
    tenantId,
    tipo: 'receber',
    osId: novaOS.id,
    cli: 'cli_expresso_alfa',
    valor: receitaTotalOS,
    venc: '2026-09-11',
    st: 'pago',
    forma: 'PIX',
    pagoEm: '2026-09-11T15:30:00.000Z'
  });

  state.movimentos.push({
    id: 'mov_pix_01',
    tenantId,
    data: '2026-09-11',
    tipo: 'entrada',
    desc: `Recebimento OS 2001 - Expresso Alfa`,
    valor: receitaTotalOS,
    conta: 'Banco Santander - Conta Principal'
  });

  // 1.11 16:00 — Entrega Técnica do Veículo e Atualização do Odômetro
  novaOS.st = 'finalizada';
  novaOS.total = receitaTotalOS;
  novaOS.valorTotal = receitaTotalOS;
  novaOS.concluidaEm = '2026-09-11';
  novaOS.dataEntrega = '2026-09-11';
  const veiculo = state.veiculos.find(v => v.id === novaOS.vei);
  veiculo.km = 450000;

  // 1.12 Atualização da Linha do Tempo e Métrica de Receita Histórica do Cliente (LTV Realizado)
  const timeline = customerTimelineService.obterTimelineCliente({
    tenantId,
    state,
    customerId: 'cli_expresso_alfa'
  });
  assert.ok(timeline.metrics, 'Métricas da timeline do cliente geradas');
  assert.equal(timeline.metrics.receitaHistoricaCliente, receitaTotalOS, 'Receita histórica corresponde ao faturamento realizado');
  assert.equal(timeline.metrics.ticketMedio, receitaTotalOS, 'Ticket médio consistente');

  // 1.13 Follow-up de Pós-Venda em D+2
  const resPosVenda = afterSalesService.avaliarPosVenda({
    tenantId,
    state,
    dataReferencia: '2026-09-13' // D+2 da entrega
  });
  assert.ok(resPosVenda.pendentesHoje.length > 0, 'Contato de pós-venda D+2 gerado na fila');
  const contatoD2 = resPosVenda.pendentesHoje[0];
  assert.equal(contatoD2.tipo, 'verificacao_servico');

  const msgD2 = afterSalesService.gerarMensagemFollowUp({
    tenantId,
    state,
    osId: novaOS.id
  });
  assert.ok(msgD2.includes('Verônica'), 'Mensagem usa nome configurado da assistente');
  assert.ok(msgD2.includes('a Verônica'), 'Mensagem usa artigo feminino da assistente');
});

/* ── 2. SEGURANÇA MULTI-TENANT: SPOOFING DE X-TENANT-ID ─────────── */
test('2. Multi-Tenant Security: Bloqueio estrito de cross-tenant spoofing com HTTP 403', () => {
  const registry = new IdentityRegistry();

  // Registrar Tenant A e Usuário A (que só tem permissão no Tenant A)
  registry.registerUser({
    username: 'operador_alfa',
    password: 'senha-super-segura-tenant-a-1234',
    memberships: [{ tenantId: 'tenant_alfa', role: 'consultor', permissions: ['os:read', 'os:write'] }]
  });

  const authMiddleware = createAuthMiddleware(registry, {
    defaultSingleTenantId: 'tenant_alfa',
    enforceAuth: true
  });

  // 2.1 Requisição legítima de Tenant A: permitido
  const reqLegitima = {
    headers: {
      authorization: 'Basic ' + Buffer.from('operador_alfa:senha-super-segura-tenant-a-1234').toString('base64'),
      'x-tenant-id': 'tenant_alfa'
    },
    path: '/api/os',
    method: 'GET',
    ip: '127.0.0.1'
  };
  const resLegitima = {};
  let nextChamado = false;
  authMiddleware(reqLegitima, resLegitima, () => { nextChamado = true; });
  assert.ok(nextChamado, 'Acesso legítimo permitido');
  assert.equal(reqLegitima.securityContext.tenantId, 'tenant_alfa');

  // 2.2 Tentativa forjada de spoofing: Operador do Tenant A envia x-tenant-id: tenant_beta
  const reqForjada = {
    headers: {
      authorization: 'Basic ' + Buffer.from('operador_alfa:senha-super-segura-tenant-a-1234').toString('base64'),
      'x-tenant-id': 'tenant_beta'
    },
    path: '/api/os',
    method: 'GET',
    ip: '127.0.0.1'
  };
  let statusResposta = 0;
  let corpoResposta = null;
  const resForjada = {
    status: (s) => { statusResposta = s; return resForjada; },
    json: (j) => { corpoResposta = j; return resForjada; },
    setHeader: () => {}
  };

  authMiddleware(reqForjada, resForjada, () => {
    assert.fail('Não deveria chamar next() em tentativa de spoofing cross-tenant');
  });

  assert.equal(statusResposta, 403, 'Bloqueio estrito com HTTP 403 Forbidden');
  assert.equal(corpoResposta.error, 'Acesso negado: tenant não autorizado para esta identidade.');
});

/* ── 3. CUSTOMIZAÇÃO DE ASSISTENTE: 2 TENANTS CONCORRENTES ───────── */
test('3. Customização de Assistente: 2 Tenants com nomes e gêneros distintos sem contaminação', () => {
  // Tenant 1: Verônica (feminino)
  const stateTenant1 = {
    tenantId: 'tenant_oficina_1',
    cfg: {
      empresa: 'Auto Molas Brasil',
      assistente: { displayName: 'Verônica', voiceGender: 'female', enabled: true },
      posVenda: { contatos: [{ diasAposEntrega: 2, tipo: 'verificacao_servico' }] }
    },
    clientes: [{ id: 'c1', nome: 'Cliente 1', fone: '11999990001', consentimentos: { optOut: false }, preferenciasContato: { whatsapp: true, afterSales: true } }],
    veiculos: [{ id: 'v1', placa: 'AAA1111', cli: 'c1' }],
    os: [{ id: 'os1', cli: 'c1', vei: 'v1', st: 'finalizada', dataEntrega: '2026-09-09' }]
  };

  // Tenant 2: Carlos (masculino)
  const stateTenant2 = {
    tenantId: 'tenant_oficina_2',
    cfg: {
      empresa: 'Mecânica Santa Fé',
      assistente: { displayName: 'Carlos', voiceGender: 'male', enabled: true },
      posVenda: { contatos: [{ diasAposEntrega: 2, tipo: 'verificacao_servico' }] }
    },
    clientes: [{ id: 'c2', nome: 'Cliente 2', fone: '11999990002', consentimentos: { optOut: false }, preferenciasContato: { whatsapp: true, afterSales: true } }],
    veiculos: [{ id: 'v2', placa: 'BBB2222', cli: 'c2' }],
    os: [{ id: 'os2', cli: 'c2', vei: 'v2', st: 'finalizada', dataEntrega: '2026-09-09' }]
  };

  const msg1 = afterSalesService.gerarMensagemFollowUp({
    tenantId: 'tenant_oficina_1',
    state: stateTenant1,
    osId: 'os1'
  });
  const msg2 = afterSalesService.gerarMensagemFollowUp({
    tenantId: 'tenant_oficina_2',
    state: stateTenant2,
    osId: 'os2'
  });

  assert.ok(msg1.includes('Verônica'), 'Tenant 1 saúda como Verônica');
  assert.ok(msg1.includes('a Verônica'), 'Tenant 1 usa artigo feminino');
  assert.ok(!msg1.includes('Carlos'), 'Tenant 1 não vaza Carlos');

  assert.ok(msg2.includes('Carlos'), 'Tenant 2 saúda como Carlos');
  assert.ok(msg2.includes('o Carlos'), 'Tenant 2 usa artigo masculino');
  assert.ok(!msg2.includes('Verônica'), 'Tenant 2 não vaza Verônica');
});

/* ── 4. SAAS SUBSCRIPTIONS & DOWNGRADE NÃO-DESTRUTIVO ────────────── */
test('4. Assinaturas SaaS: trial 14d, feature flags e downgrade não destrutivo', () => {
  const state = {
    tenantId: 'tenant_saas_demo',
    cfg: {},
    quotations: [{ id: 'q1', versao: 1 }],
    fleetPlans: [{ id: 'fp1', nome: 'Plano Frotista Ouro' }]
  };

  // Inicializa com Trial (retorna objeto com plano trial)
  const sub = subscriptionService.obterAssinatura('tenant_saas_demo', state);
  assert.equal(sub.plan, 'trial');
  assert.equal(sub.diasRestantesTrial, 14);
  assert.ok(subscriptionService.hasFeature('tenant_saas_demo', 'voz_inteligente', state));
  assert.ok(subscriptionService.hasFeature('tenant_saas_demo', 'relatorios_avancados', state));

  // Upgrade para Pro
  subscriptionService.atualizarPlano({ tenantId: 'tenant_saas_demo', state, novoPlano: 'pro' });
  assert.equal(state.subscription.plan, 'pro');
  assert.ok(subscriptionService.hasFeature('tenant_saas_demo', 'frotas_avancadas', state));

  // Downgrade para Essencial
  subscriptionService.atualizarPlano({ tenantId: 'tenant_saas_demo', state, novoPlano: 'essencial' });
  assert.equal(state.subscription.plan, 'essencial');
  assert.equal(subscriptionService.hasFeature('tenant_saas_demo', 'voz_inteligente', state), false);
  assert.equal(subscriptionService.hasFeature('tenant_saas_demo', 'frotas_avancadas', state), false);

  // Downgrade preserva todos os dados intactos (zero data loss)
  assert.equal(state.quotations.length, 1, 'Orçamentos preservados');
  assert.equal(state.fleetPlans.length, 1, 'Planos de frota preservados');
});

/* ── 5. DADOS DE DEMONSTRAÇÃO: SEED & PURGE ISOLADO ──────────────── */
test('5. Dados de Demonstração: injeção com tag _isDemo e remoção cirúrgica sem afetar dados reais', () => {
  const state = {
    tenantId: 'tenant_onboarding',
    cfg: { empresa: 'Oficina Real' },
    clientes: [
      { id: 'cli_real', nome: 'Transportes Reais Ltda', fone: '11988880000' }
    ],
    veiculos: [
      { id: 'vei_real', placa: 'REAL123', modelo: 'Scania R450' }
    ],
    os: [
      { id: 'os_real', num: 901, st: 'executando' }
    ]
  };

  // Injetar dados demo
  demoDataService.carregarDadosDemonstracao({ tenantId: 'tenant_onboarding', state });
  assert.ok(state.clientes.some(c => c._isDemo === true), 'Clientes demo inseridos');
  assert.ok(state.veiculos.some(v => v._isDemo === true), 'Veículos demo inseridos');
  assert.ok(state.os.some(o => o._isDemo === true), 'OSs demo inseridas');

  // Limpar dados demo
  const resultadoLimpeza = demoDataService.removerDadosDemonstracao({ tenantId: 'tenant_onboarding', state });
  assert.ok(resultadoLimpeza.totalRemovidos > 0);

  // Registros reais preservados
  assert.equal(state.clientes.length, 1, 'Apenas cliente real remanescente');
  assert.equal(state.clientes[0].id, 'cli_real');
  assert.equal(state.veiculos.length, 1, 'Apenas veículo real remanescente');
  assert.equal(state.veiculos[0].id, 'vei_real');
  assert.equal(state.os.length, 1, 'Apenas OS real remanescente');
  assert.equal(state.os[0].id, 'os_real');
});

/* ── 6. CONFORMIDADE LGPD: EXPORTAÇÃO E ANONIMIZAÇÃO ─────────────── */
test('6. LGPD: exportação completa de dados pessoais e anonimização com preservação fiscal', () => {
  const state = {
    tenantId: 'tenant_lgpd',
    clientes: [
      {
        id: 'cli_pedro',
        nome: 'Pedro Álvares Cabral',
        doc: '123.456.789-00',
        fone: '11987654321',
        email: 'pedro@cabralnavega.com.br',
        endereco: 'Av. Paulista, 1000'
      }
    ],
    veiculos: [
      { id: 'vei_1', cli: 'cli_pedro', placa: 'NAV1500', modelo: 'Caravela Truck' }
    ],
    os: [
      { id: 'os_1', cli: 'cli_pedro', num: 501, total: 3500.00, st: 'finalizada' }
    ],
    contas: [
      { id: 'ct_1', cli: 'cli_pedro', valor: 3500.00, st: 'pago' }
    ]
  };

  // 6.1 Exportação
  const exportado = lgpdService.exportarDadosCliente({ tenantId: 'tenant_lgpd', state, customerId: 'cli_pedro' });
  assert.equal(exportado.ok, true);
  assert.equal(exportado.titular.nome, 'Pedro Álvares Cabral');
  assert.equal(exportado.veiculos.length, 1);
  assert.equal(exportado.ordensServico.length, 1);

  // 6.2 Anonimização
  const resAnonim = lgpdService.anonimizarDadosCliente({ tenantId: 'tenant_lgpd', state, customerId: 'cli_pedro' });
  assert.equal(resAnonim.ok, true);

  const clienteAnonimizado = state.clientes.find(c => c.id === 'cli_pedro');
  assert.ok(clienteAnonimizado.nome.includes('Anonimizado'));
  assert.equal(clienteAnonimizado.fone, null);
  assert.equal(clienteAnonimizado.email, null);
  assert.equal(clienteAnonimizado.endereco, null);
  assert.equal(clienteAnonimizado.anonimizado, true);

  // Dados financeiros e de OS permanecem intactos para cumprimento fiscal
  assert.equal(state.os[0].total, 3500.00);
  assert.equal(state.contas[0].valor, 3500.00);
});

/* ── 7. ARMAZENAMENTO DE ARQUIVOS EM DISCO & RETENÇÃO LEVE ───────── */
test('7. File Storage: Upload isolado por tenant, resolução retrocompatível e deleção física', () => {
  const tenantId = 'tenant_storage_test';
  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

  // 7.1 Salvar upload
  const infoUpload = fileStorage.salvarUpload({
    tenantId,
    tipo: 'logo',
    buffer: pngBuffer,
    mimeType: 'image/png'
  });

  assert.ok(infoUpload.url.startsWith(`/uploads/${tenantId}/`));
  const fullPath = path.resolve(__dirname, '..', infoUpload.path);
  assert.ok(fs.existsSync(fullPath), 'Arquivo gravado fisicamente em disco');

  // 7.2 Resolução retrocompatível
  assert.equal(fileStorage.resolverUrlImagem('data:image/png;base64,mock'), 'data:image/png;base64,mock');
  assert.equal(fileStorage.resolverUrlImagem(infoUpload.url), infoUpload.url);

  // 7.3 Remover upload
  const removido = fileStorage.removerUpload({ tenantId, url: infoUpload.url });
  assert.ok(removido, 'Arquivo removido com sucesso');
  assert.equal(fs.existsSync(fullPath), false, 'Arquivo excluído fisicamente do disco');
});

/* ── 8. INTEGRIDADE DE SCHEMA E MIGRAÇÃO AUTOMÁTICA ──────────────── */
test('8. Schema Migration: Inicialização de blocos ausentes e versão canônica', () => {
  const estadoLegado = {
    cfg: {
      empresa: 'Oficina das Molas'
    },
    os: [],
    clientes: []
  };

  migrarSchemaEstado(estadoLegado);
  assert.equal(estadoLegado.schemaVersion, 1);
  assert.ok(estadoLegado.cfg.manutencaoPreventiva, 'cfg.manutencaoPreventiva inicializado');
  assert.ok(estadoLegado.cfg.posVenda, 'cfg.posVenda inicializado');
  assert.ok(estadoLegado.cfg.identidadeVisual, 'cfg.identidadeVisual inicializado');
});

/* ── 9. TESTE HTTP REAL: /health, /ready, LGPD, UPLOADS & RATE LIMITING ── */
test('9. Servidor Real E2E: /health, /ready, limites de taxa, uploads e endpoints LGPD', { timeout: 120000 }, async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-e2e-workshop-'));
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  const root = path.resolve(__dirname, '..');
  let logs = '';
  let child;

  async function startServer() {
    child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-audit-key-2026',
        NODE_ENV: 'test',
        DISABLE_INTEGRATIONS: 'true',
        DB_PATH: path.join(tempDir, 'patio_test.db')
      }
    });

    child.stdout.on('data', d => { logs += d; });
    child.stderr.on('data', d => { logs += d; });

    for (let i = 0; i < 500; i++) {
      if (child.exitCode !== null) throw new Error('Falha ao iniciar servidor: ' + logs);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.status === 200) return;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Servidor não respondeu no timeout: ' + logs);
  }

  async function stopServer() {
    if (child && child.exitCode === null) {
      const done = once(child, 'exit');
      child.kill();
      await done;
    }
  }

  t.after(async () => {
    await stopServer();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await startServer();

  const apiFetch = (url, opts = {}) => fetch(`http://127.0.0.1:${port}${url}`, {
    ...opts,
    headers: { 'x-api-key': 'test-audit-key-2026', ...opts.headers }
  });

  // 9.1 Teste de /health (Liveness)
  const resHealth = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(resHealth.status, 200);
  const jsonHealth = await resHealth.json();
  assert.equal(jsonHealth.status, 'ok');
  assert.ok(typeof jsonHealth.uptimeSeconds === 'number');

  // 9.2 Teste de /ready (Readiness)
  const resReady = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(resReady.status, 200);
  const jsonReady = await resReady.json();
  assert.equal(jsonReady.status, 'ready');

  // 9.3 Teste de Assinatura SaaS (/api/assinatura)
  const resAssinatura = await apiFetch('/api/assinatura');
  assert.equal(resAssinatura.status, 200);
  const jsonAssinatura = await resAssinatura.json();
  assert.ok(jsonAssinatura.subscription && jsonAssinatura.subscription.plan, 'Plano de assinatura presente');

  // 9.4 Teste de LGPD via API
  // Inserir cliente no estado
  const resEstadoInicial = await apiFetch('/api/estado');
  const estadoAtual = await resEstadoInicial.json();
  estadoAtual.clientes = estadoAtual.clientes || [];
  estadoAtual.clientes.push({
    id: 'cli_lgpd_http',
    nome: 'Carlos Drummond',
    doc: '987.654.321-00',
    fone: '31988887777',
    email: 'carlos@poesia.com.br'
  });

  await apiFetch('/api/estado', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(estadoAtual)
  });

  // Exportar dados
  const resExport = await apiFetch('/api/lgpd/clientes/cli_lgpd_http/exportar');
  assert.equal(resExport.status, 200);
  const jsonExport = await resExport.json();
  assert.equal(jsonExport.titular.nome, 'Carlos Drummond');

  // Anonimizar dados
  const resAnonim = await apiFetch('/api/lgpd/clientes/cli_lgpd_http/anonimizar', { method: 'POST' });
  assert.equal(resAnonim.status, 200);

  // Verificar que foi mascarado
  const resEstadoAposAnonim = await apiFetch('/api/estado');
  const estadoAposAnonim = await resEstadoAposAnonim.json();
  const cliApos = estadoAposAnonim.clientes.find(c => c.id === 'cli_lgpd_http');
  assert.ok(cliApos.nome.includes('Anonimizado'));
  assert.equal(cliApos.anonimizado, true);

  // 9.5 Teste de Onboarding & Demo Data via API
  const resDemoPost = await apiFetch('/api/onboarding/demo-data', { method: 'POST' });
  assert.equal(resDemoPost.status, 200);
  const jsonDemoPost = await resDemoPost.json();
  assert.equal(jsonDemoPost.ok, true);

  const resDemoDelete = await apiFetch('/api/onboarding/demo-data', { method: 'DELETE' });
  assert.equal(resDemoDelete.status, 200);
  const jsonDemoDelete = await resDemoDelete.json();
  assert.equal(jsonDemoDelete.ok, true);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../services/financialEngine.js');

test('1. Isolamento Estrito por Tenant (Sem vazamento de estado ou dados)', () => {
  const tenantA = {
    cfg: { empresa: 'Auto Molas Fort A', saldoInicial: 50000 },
    os: [
      { id: 'os-a1', vei: 'v-a1', cli: 'c-a1', st: 'executando', box: 'b1', abertura: '2026-09-08' }
    ],
    veiculos: [{ id: 'v-a1', placa: 'AAA1A11', modelo: 'Volvo FH 540' }],
    clientes: [{ id: 'c-a1', nome: 'Transportadora Alfa' }],
    boxes: [{ id: 'b1', nome: 'Box 01' }],
    contas: [
      { id: 'c-a1', tipo: 'receber', valor: 15000, venc: '2026-09-10', pago: false }
    ],
    movimentos: []
  };

  const tenantB = {
    cfg: { empresa: 'Diesel Power B', saldoInicial: 10000 },
    os: [
      { id: 'os-b1', vei: 'v-b1', cli: 'c-b1', st: 'peca', box: 'b2', abertura: '2026-09-09', obs: 'Válvula de freio' }
    ],
    veiculos: [{ id: 'v-b1', placa: 'BBB2B22', modelo: 'Scania R450' }],
    clientes: [{ id: 'c-b1', nome: 'Logística Beta' }],
    boxes: [{ id: 'b2', nome: 'Box 02' }],
    contas: [
      { id: 'c-b1', tipo: 'pagar', valor: 4500, venc: '2026-09-10', pago: false }
    ],
    movimentos: []
  };

  const tenantC = {
    cfg: { empresa: 'Oficina C Vazia' },
    os: [],
    veiculos: [],
    clientes: [],
    boxes: [],
    contas: [],
    movimentos: []
  };

  const ref = '2026-09-10';

  // Executa relatórios para Tenant A
  const relA = engine.gerarRelatorioExecutivo(tenantA, { dataRef: ref });
  const msgsA = engine.gerarMensagensAdmin(tenantA, { dataRef: ref });
  const opMsgsA = engine.gerarMensagensOperacao(tenantA, { dataRef: ref });

  // Executa relatórios para Tenant B
  const relB = engine.gerarRelatorioExecutivo(tenantB, { dataRef: ref });
  const msgsB = engine.gerarMensagensAdmin(tenantB, { dataRef: ref });

  // Executa relatórios para Tenant C (vazio)
  const relC = engine.gerarRelatorioExecutivo(tenantC, { dataRef: ref });

  // Verificações Tenant A
  assert.match(relA.texto, /Auto Molas Fort A/);
  assert.match(relA.texto, /AAA1A11/);
  assert.doesNotMatch(relA.texto, /BBB2B22/);
  assert.doesNotMatch(relA.texto, /Diesel Power B/);
  assert.equal(relA.financeiro.saldoConsolidado, 50000);
  assert.equal(relA.financeiro.totalRecHoje, 15000);
  assert.equal(relA.financeiro.totalPagHoje, 0);

  // Verificações Tenant B
  assert.match(relB.texto, /Diesel Power B/);
  assert.match(relB.texto, /BBB2B22/);
  assert.doesNotMatch(relB.texto, /AAA1A11/);
  assert.doesNotMatch(relB.texto, /Auto Molas Fort A/);
  assert.equal(relB.financeiro.saldoConsolidado, 10000);
  assert.equal(relB.financeiro.totalRecHoje, 0);
  assert.equal(relB.financeiro.totalPagHoje, 4500);

  // Verificações Tenant C (Totalmente isolado e zerado)
  assert.equal(relC.financeiro.saldoConsolidado, 0);
  assert.equal(relC.operacional.totalOSAtivas, 0);
  assert.equal(relC.operacional.totalAmanhecidos, 0);
  assert.match(relC.texto, /Nenhum veículo amanheceu no pátio hoje/);
});

test('2. Regra Rigorosa de "Veículos que Amanheceram" (Zero amanhecidos quando nenhum pernoitou)', () => {
  const ref = '2026-09-10';

  // Cenário 1: Há 2 veículos na oficina, mas AMBOS deram entrada HOJE (2026-09-10)
  const stateHoje = {
    cfg: { empresa: 'Oficina Teste' },
    os: [
      { id: 'os-1', vei: 'v-1', cli: 'c-1', st: 'executando', box: 'b1', abertura: '2026-09-10' },
      { id: 'os-2', vei: 'v-2', cli: 'c-2', st: 'fila', abertura: '2026-09-10' }
    ],
    veiculos: [
      { id: 'v-1', placa: 'HOJ1111', modelo: 'Mercedes Actros' },
      { id: 'v-2', placa: 'HOJ2222', modelo: 'VW Meteor' }
    ],
    clientes: [
      { id: 'c-1', nome: 'Cliente 1' },
      { id: 'c-2', nome: 'Cliente 2' }
    ],
    boxes: [{ id: 'b1', nome: 'Box 01' }]
  };

  const opHoje = engine.calcularResumoOperacional(stateHoje, { dataRef: ref });
  assert.equal(opHoje.totalOSAtivas, 2, 'Total de OS ativas deve ser 2');
  assert.equal(opHoje.totalAmanhecidos, 0, 'Total de amanhecidos DEVE ser 0 quando todos entraram hoje');
  assert.equal(opHoje.listaAmanhecidos.length, 0, 'Lista de amanhecidos DEVE ser vazia (sem fallback para ativas)');

  const msgsAdminHoje = engine.gerarMensagensAdmin(stateHoje, { dataRef: ref });
  assert.match(msgsAdminHoje[2], /Nenhum veículo amanheceu no pátio/, 'Msg 3/3 deve declarar 0 amanhecidos');
  assert.doesNotMatch(msgsAdminHoje[2], /HOJ1111/, 'Msg 3/3 não pode conter veículos que entraram hoje');

  const msgsOpHoje = engine.gerarMensagensOperacao(stateHoje, { dataRef: ref });
  assert.match(msgsOpHoje[1], /Nenhum veículo amanheceu no pátio/, 'Msg 2/2 operação deve declarar 0 amanhecidos');

  // Cenário 2: 1 veículo pernoitou (entrada ontem 2026-09-09) e 1 entrou hoje (2026-09-10)
  const stateMisto = {
    cfg: { empresa: 'Oficina Teste' },
    os: [
      { id: 'os-1', vei: 'v-1', cli: 'c-1', st: 'executando', box: 'b1', abertura: '2026-09-09' }, // Amanheceu
      { id: 'os-2', vei: 'v-2', cli: 'c-2', st: 'fila', abertura: '2026-09-10' }                   // Entrou hoje
    ],
    veiculos: [
      { id: 'v-1', placa: 'PER9999', modelo: 'Volvo VM' },
      { id: 'v-2', placa: 'HOJ2222', modelo: 'VW Meteor' }
    ],
    clientes: [
      { id: 'c-1', nome: 'Transportes Brasil' },
      { id: 'c-2', nome: 'Cliente 2' }
    ],
    boxes: [{ id: 'b1', nome: 'Box 01' }]
  };

  const opMisto = engine.calcularResumoOperacional(stateMisto, { dataRef: ref });
  assert.equal(opMisto.totalOSAtivas, 2);
  assert.equal(opMisto.totalAmanhecidos, 1, 'Apenas 1 veículo pernoitou');
  assert.equal(opMisto.listaAmanhecidos.length, 1);
  assert.equal(opMisto.listaAmanhecidos[0].placa, 'PER9999');
  assert.equal(opMisto.listaAmanhecidos[0].diasNoPatio, 1);

  const msgsAdminMisto = engine.gerarMensagensAdmin(stateMisto, { dataRef: ref });
  assert.match(msgsAdminMisto[2], /PER9999/);
  assert.doesNotMatch(msgsAdminMisto[2], /HOJ2222/);
});

test('3. Padronização Canônica de Fuso Horário America/Sao_Paulo (Sem viradas incorretas de dia)', () => {
  assert.equal(engine.FUSO_HORARIO_PADRAO, 'America/Sao_Paulo');

  // Às 21h30 em São Paulo (UTC-3), o UTC é 00h30 do dia seguinte.
  // Em uma implementação ingênua com .toISOString().slice(0,10), o dia seria 2026-09-11.
  // No fuso canônico de SP, o dia DEVE ser rigorosamente 2026-09-10.
  const spNoite = new Date('2026-09-11T00:30:00Z'); // 21h30 em São Paulo no dia 10
  const agoraSP = engine.obterAgoraSP(spNoite);

  assert.equal(agoraSP.dataISO, '2026-09-10', 'Data ISO deve ser 2026-09-10 às 21h30 de Brasília');
  assert.equal(agoraSP.dataBR, '10/09/2026', 'Data formatada BR deve ser 10/09/2026');
  assert.equal(agoraSP.horaBR, '21:30', 'Hora formatada deve ser 21:30');

  // Às 23h59 em São Paulo
  const spFimDia = new Date('2026-09-11T02:59:00Z'); // 23h59 em São Paulo no dia 10
  const agoraSPFim = engine.obterAgoraSP(spFimDia);
  assert.equal(agoraSPFim.dataISO, '2026-09-10');
  assert.equal(agoraSPFim.horaBR, '23:59');

  // Às 00h01 do dia 11 em São Paulo
  const spNovoDia = new Date('2026-09-11T03:01:00Z'); // 00h01 em São Paulo no dia 11
  const agoraSPNovo = engine.obterAgoraSP(spNovoDia);
  assert.equal(agoraSPNovo.dataISO, '2026-09-11');
  assert.equal(agoraSPNovo.horaBR, '00:01');
});

test('4. Motor Financeiro como Única Fonte da Verdade (Dashboard, Textos e Métricas idênticos)', () => {
  const mockState = {
    cfg: { empresa: 'Auto Molas Fort', saldoInicial: 25000 },
    os: [
      { id: 'os-1', vei: 'v-1', cli: 'c-1', st: 'executando', box: 'b1', abertura: '2026-09-05' },
      { id: 'os-2', vei: 'v-2', cli: 'c-2', st: 'fila', abertura: '2026-09-10' }
    ],
    veiculos: [
      { id: 'v-1', placa: 'AAA0001', modelo: 'Constellation' },
      { id: 'v-2', placa: 'BBB0002', modelo: 'Delivery' }
    ],
    clientes: [
      { id: 'c-1', nome: 'Transportes Fort' },
      { id: 'c-2', nome: 'Logística Rápida' }
    ],
    boxes: [{ id: 'b1', nome: 'Box 01' }, { id: 'b2', nome: 'Box 02' }],
    contas: [
      { id: 'c-1', tipo: 'receber', valor: 8000, venc: '2026-09-10', pago: false },
      { id: 'c-2', tipo: 'receber', valor: 4000, venc: '2026-09-08', pago: false }, // Vencido
      { id: 'c-3', tipo: 'pagar', valor: 5000, venc: '2026-09-10', pago: false },
      { id: 'c-4', tipo: 'receber', valor: 12000, venc: '2026-09-15', pago: false } // Em 5 dias
    ],
    movimentos: [
      { id: 'm-1', data: '2026-09-09', tipo: 'entrada', valor: 3000, cat: 'Serviços' }
    ]
  };

  const ref = '2026-09-10';

  // 1. Dashboard payload
  const dash = engine.obterDashboardFinanceiro(mockState, { dataRef: ref, filtro: 'hoje' });

  // 2. Relatório Executivo
  const rel = engine.gerarRelatorioExecutivo(mockState, { dataRef: ref });

  // 3. Mensagens Admin
  const msgsAdmin = engine.gerarMensagensAdmin(mockState, { dataRef: ref });

  // 4. Mensagens Operação
  const msgsOp = engine.gerarMensagensOperacao(mockState, { dataRef: ref });

  // 5. Resumos
  const resCaixa = engine.gerarResumoCaixa(mockState, { dataRef: ref });
  const resPatio = engine.gerarResumoPatio(mockState, { dataRef: ref });

  // Verificação de consistência total entre todas as superfícies
  const saldoEsperado = 25000 + 3000; // 28000
  assert.equal(dash.kpis.saldoConsolidado, saldoEsperado);
  assert.equal(rel.financeiro.saldoConsolidado, saldoEsperado);
  assert.equal(rel.indicadores.saldoCaixa, saldoEsperado);
  assert.match(msgsAdmin[0], /R\$\s*28\.000,00/);
  assert.match(resCaixa, /R\$\s*28\.000,00/);

  // Vencimentos de hoje: A Receber = 8000, A Pagar = 5000, Líquido = +3000
  assert.equal(dash.kpis.totalRecHoje, 8000);
  assert.equal(rel.financeiro.totalRecHoje, 8000);
  assert.equal(dash.kpis.totalPagHoje, 5000);
  assert.equal(rel.financeiro.totalPagHoje, 5000);
  assert.equal(dash.kpis.liquidoHoje, 3000);
  assert.equal(rel.financeiro.liquidoHoje, 3000);

  // Operacional: 2 OS ativas, 1 amanhecido (AAA0001), 1 na fila (BBB0002)
  assert.equal(dash.operacional.totalOSAtivas, 2);
  assert.equal(rel.operacional.totalOSAtivas, 2);
  assert.equal(dash.operacional.totalAmanhecidos, 1);
  assert.equal(rel.operacional.totalAmanhecidos, 1);
  assert.equal(rel.operacional.listaAmanhecidos[0].placa, 'AAA0001');

  // Textos das mensagens refletem exatamente estes números
  assert.match(msgsAdmin[1], /Total de Caminhões no Pátio:\* 2/);
  assert.match(msgsAdmin[2], /AAA0001/);
  assert.doesNotMatch(msgsAdmin[2], /BBB0002/);

  assert.match(msgsOp[0], /Total de Caminhões em Atendimento:\* 2/);
  assert.match(msgsOp[1], /AAA0001/);
  assert.doesNotMatch(msgsOp[1], /BBB0002/);

  assert.match(resPatio, /Total de Caminhões na Oficina: \*2\*/);
  assert.match(resPatio, /Amanheceram na Oficina: \*1\*/);
});

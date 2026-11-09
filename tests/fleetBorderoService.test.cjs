'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initDB } = require('../db');
const { persistState, getState } = require('../lib/repository/stateRepository');

const fleetBorderoService = require('../services/billing/fleetBorderoService');
const fleetBorderoCalc = require('../services/billing/fleetBorderoCalc');

test('P0: Motor de Faturamento em Lote de Frotas (Borderô) & Gestão de Boletos B2B', async (t) => {
  await initDB();

  const criarEstadoMock = () => ({
    versao: 1,
    cfg: {
      oficina: {
        nome: 'Auto Molas Fort Diesel',
        cnpj: '12.345.678/0001-99',
        cidade: 'FORTALEZA',
        dadosBancarios: {
          banco: '001',
          agencia: '1234',
          conta: '56789',
          carteira: '17',
          chavePix: 'financeiro@molasfort.com.br'
        }
      }
    },
    clientes: [
      {
        id: 'cli_transp_alfa',
        nome: 'Transnorte Logística e Cargas Ltda',
        doc: '01.234.567/0001-89',
        tipo: 'pj',
        fone: '5585999990001',
        email: 'financeiro@transnorte.com.br'
      }
    ],
    os: [
      {
        id: 'os_201',
        num: '201',
        tenantId: 'tenant_frota_test',
        cli: 'cli_transp_alfa',
        st: 'finalizada',
        fechamento: '2026-11-02T10:00:00Z',
        veiculo: {
          placa: 'ABC1D23',
          modelo: 'Volvo FH 540',
          tipo: 'cavalo'
        },
        servicos: [
          { id: 's1', desc: 'Revisão Suspensão Dianteira', valor: 800.00, alvo: 'cavalo', placaAlvo: 'ABC1D23' }
        ],
        pecas: [
          { id: 'p1', desc: 'Mola Mestra Dianteira', valor: 1200.00, qtd: 1, total: 1200.00 }
        ],
        total: 2000.00
      },
      {
        id: 'os_202',
        num: '202',
        tenantId: 'tenant_frota_test',
        cli: 'cli_transp_alfa',
        st: 'entregue',
        fechamento: '2026-11-04T16:30:00Z',
        veiculo: {
          placa: 'XYZ9K87',
          modelo: 'Scania R450 + Randon Graneleiro',
          tipo: 'articulado'
        },
        conjuntoArticulado: {
          cavalo: { placa: 'XYZ9K87', modelo: 'Scania R450' },
          carretas: [{ placa: 'CAR1A22', modelo: 'Randon 3 Eixos' }]
        },
        servicos: [
          { id: 's2', desc: 'Alinhamento Cavalo', valor: 400.00, alvo: 'cavalo', placaAlvo: 'XYZ9K87' },
          { id: 's3', desc: 'Troca de Buchas Tirante Carreta', valor: 600.00, alvo: 'carreta', placaAlvo: 'CAR1A22' }
        ],
        pecas: [
          { id: 'p2', desc: 'Jogo Buchas de Poliuretano', valor: 500.00, qtd: 1, total: 500.00 }
        ],
        total: 1500.00
      },
      {
        id: 'os_203_aberta',
        num: '203',
        tenantId: 'tenant_frota_test',
        cli: 'cli_transp_alfa',
        st: 'em_andamento', // Não deve ser faturável
        servicos: [{ id: 's4', desc: 'Socorro', valor: 300.00 }],
        pecas: [],
        total: 300.00
      }
    ],
    contas: [],
    borderos: []
  });

  await t.test('1. Listar OSs faturáveis: filtra finalizadas/entregues e exclui em andamento e já faturadas', () => {
    const state = criarEstadoMock();
    const faturaveis = fleetBorderoService.listarOSFaturaveisPorCliente({
      state,
      tenantId: 'tenant_frota_test',
      clienteId: 'cli_transp_alfa'
    });

    assert.equal(faturaveis.length, 2, 'Deve retornar apenas as 2 OSs concluídas (os_201 e os_202)');
    assert.deepEqual(faturaveis.map(o => o.id), ['os_201', 'os_202']);

    // Filtro por janela de período
    const filtradasPeriodo = fleetBorderoService.listarOSFaturaveisPorCliente({
      state,
      tenantId: 'tenant_frota_test',
      clienteId: 'cli_transp_alfa',
      dataInicio: '2026-11-03',
      dataFim: '2026-11-05'
    });
    assert.equal(filtradasPeriodo.length, 1, 'Deve retornar apenas 1 OS dentro da janela (os_202)');
    assert.equal(filtradasPeriodo[0].id, 'os_202');
  });

  await t.test('2. Prévia do Borderô: cálculo segregado mão de obra vs peças, desconto e retenções', () => {
    const state = criarEstadoMock();
    const previa = fleetBorderoService.simularPreviaBordero({
      state,
      tenantId: 'tenant_frota_test',
      clienteId: 'cli_transp_alfa',
      osIds: ['os_201', 'os_202'],
      descontoGeral: 100.00,
      retencoes: {
        iss: 2.0, // 2% sobre mão de obra (1800 * 0.02 = 36.00)
        irrf: 1.5 // 1.5% sobre total bruto (3500 * 0.015 = 52.50)
      },
      condicaoPagamento: '14/28/42'
    });

    assert.equal(previa.ok, true);
    assert.equal(previa.resumoTotais.totalMaoDeObra, 1800.00, 'Mão de obra total: 800 + 400 + 600 = 1800');
    assert.equal(previa.resumoTotais.totalPecas, 1700.00, 'Peças total: 1200 + 500 = 1700');
    assert.equal(previa.resumoTotais.subtotalBruto, 3500.00, 'Subtotal bruto: 1800 + 1700 = 3500');
    assert.equal(previa.resumoTotais.descontoGeral, 100.00);

    // Retenções contratuais
    assert.equal(previa.resumoTotais.totalRetencoes, 88.50, 'Retenções: 36 (ISS) + 52.50 (IRRF) = 88.50');
    // Total líquido: 3500 - 100 - 88.50 = 3311.50
    assert.equal(previa.resumoTotais.totalLiquido, 3311.50);

    // Desdobramento de parcelas em 3x (14, 28, 42 dias)
    assert.equal(previa.parcelas.length, 3, 'Deve gerar 3 parcelas');
    const somaParcelas = previa.parcelas.reduce((acc, p) => acc + p.valor, 0);
    assert.equal(Math.round(somaParcelas * 100) / 100, 3311.50, 'A soma das parcelas deve bater com o total líquido');

    // Discriminação analítica de veículos (inclusive conjunto articulado)
    assert.equal(previa.espelhoAnalitico.length, 2);
    const osArticulada = previa.espelhoAnalitico.find(e => e.osId === 'os_202');
    assert.ok(osArticulada, 'Deve conter a OS articulada no espelho');
    assert.equal(osArticulada.discriminacaoArticulado.length, 2, 'Deve segregar serviços de Cavalo e Carreta');
  });

  await t.test('3. Fechar Borderô: trava OSs, gera contas a receber com boletos Febraban e persistência', async () => {
    const state = criarEstadoMock();
    const resultado = fleetBorderoService.fecharBordero({
      state,
      tenantId: 'tenant_frota_test',
      clienteId: 'cli_transp_alfa',
      osIds: ['os_201', 'os_202'],
      descontoGeral: 100.00,
      condicaoPagamento: '30ddl',
      operador: 'gerente_frotas'
    });

    assert.equal(resultado.ok, true);
    assert.ok(resultado.bordero, 'Borderô deve ter sido gerado');
    const bordero = resultado.bordero;
    assert.match(bordero.num, /^BORD-\d+/, 'Número do borderô deve seguir padrão BORD-XXXX');
    assert.equal(bordero.status, 'faturado');
    assert.equal(bordero.osIds.length, 2);

    // Trava nas OSs
    const os1 = state.os.find(o => o.id === 'os_201');
    const os2 = state.os.find(o => o.id === 'os_202');
    assert.equal(os1.borderoId, bordero.id);
    assert.equal(os1.statusBordero, 'faturado');
    assert.equal(os2.borderoId, bordero.id);
    assert.equal(os2.statusBordero, 'faturado');

    // Títulos a receber gerados em state.contas
    assert.equal(state.contas.length, 1, 'Condição 30ddl gera 1 parcela');
    const conta = state.contas[0];
    assert.equal(conta.tipo, 'receber');
    assert.equal(conta.borderoId, bordero.id);
    assert.equal(conta.cli, 'cli_transp_alfa');
    assert.equal(conta.forma, 'boleto');
    assert.ok(conta.boleto, 'Conta deve conter objeto do boleto');
    assert.equal(conta.boleto.codigoBarras.length, 44, 'Boleto deve conter código de barras de 44 dígitos');
    assert.match(conta.boleto.linhaDigitavel, /^[0-9]{5}\.[0-9]{5}/, 'Boleto deve conter linha digitável');
    assert.ok(conta.boleto.pixCopiaECola.startsWith('000201'), 'Boleto deve conter Pix Copia e Cola EMVCo');
  });

  await t.test('4. Anti-duplicidade: rejeita inclusão de OSs já faturadas em outro borderô', () => {
    const state = criarEstadoMock();
    // Fatura primeira vez
    fleetBorderoService.fecharBordero({
      state,
      tenantId: 'tenant_frota_test',
      clienteId: 'cli_transp_alfa',
      osIds: ['os_201'],
      condicaoPagamento: 'a_vista',
      operador: 'gerente_frotas'
    });

    // Tenta faturar novamente com a mesma OS
    const tentativaDuplicada = fleetBorderoService.simularPreviaBordero({
      state,
      tenantId: 'tenant_frota_test',
      clienteId: 'cli_transp_alfa',
      osIds: ['os_201', 'os_202']
    });

    assert.equal(tentativaDuplicada.ok, false);
    assert.match(tentativaDuplicada.error, /vinculada a outro borderô/i);
  });

  await t.test('5. Cancelamento atômico de borderô: libera OSs e cancela títulos a receber', () => {
    const state = criarEstadoMock();
    const resFechar = fleetBorderoService.fecharBordero({
      state,
      tenantId: 'tenant_frota_test',
      clienteId: 'cli_transp_alfa',
      osIds: ['os_201', 'os_202'],
      condicaoPagamento: '14/28/42',
      operador: 'gerente_frotas'
    });
    const borderoId = resFechar.bordero.id;

    const resCancela = fleetBorderoService.cancelarBordero({
      state,
      tenantId: 'tenant_frota_test',
      borderoId,
      motivo: 'Ajuste de negociação comercial com frotista',
      operador: 'diretor_financeiro'
    });

    assert.equal(resCancela.ok, true);
    assert.equal(resCancela.bordero.status, 'cancelado');
    assert.equal(resCancela.bordero.canceladoPor, 'diretor_financeiro');

    // OSs liberadas
    const os1 = state.os.find(o => o.id === 'os_201');
    assert.equal(os1.borderoId, null);
    assert.equal(os1.statusBordero, 'aberto');

    // Títulos a receber cancelados
    for (const c of state.contas.filter(x => x.borderoId === borderoId)) {
      assert.equal(c.st, 'cancelada');
      assert.ok(c.canceladoEm);
    }
  });

  await t.test('6. Formatação de notificação WhatsApp com espelho e chave Pix Copia e Cola', () => {
    const state = criarEstadoMock();
    const resFechar = fleetBorderoService.fecharBordero({
      state,
      tenantId: 'tenant_frota_test',
      clienteId: 'cli_transp_alfa',
      osIds: ['os_201', 'os_202'],
      condicaoPagamento: '30ddl',
      operador: 'gerente_frotas'
    });

    const mensagemWA = fleetBorderoService.formatarNotificacaoWhatsAppBordero({
      state,
      bordero: resFechar.bordero
    });

    assert.ok(mensagemWA.includes('Transnorte Logística'), 'Deve conter nome da transportadora');
    assert.ok(mensagemWA.includes('BORD-'), 'Deve conter número do borderô');
    assert.ok(mensagemWA.includes('ABC1D23'), 'Deve listar placa 1');
    assert.ok(mensagemWA.includes('XYZ9K87'), 'Deve listar placa 2');
    assert.ok(mensagemWA.includes('Linha Digitável:'), 'Deve conter linha digitável do boleto');
    assert.ok(mensagemWA.includes('Pix Copia e Cola:'), 'Deve conter Pix Copia e Cola');
  });
});

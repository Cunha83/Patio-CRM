'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { initDB } = require('../db');
const { persistState, getState } = require('../lib/repository/stateRepository');

const {
  identificarServicoSuspensaoMolas,
  gerarGatilhoReapertoGrampos,
  formatarMensagemWhatsAppReaperto,
  avaliarReapertosPreventivos
} = require('../services/maintenance/springReclampTrigger');

test('P0: Gatilho Preventivo de Reaperto de Grampos de Mola (500 km ou 7 dias)', async (t) => {
  await initDB();

  const criarEstadoMock = () => ({
    versao: 1,
    os: [
      {
        id: 'os_mola_1',
        num: '1001',
        tenantId: 'tenant_reaperto_1',
        cli: 'cli_frota',
        vei: 'vei_scania',
        placa: 'SCN1A23',
        st: 'finalizada',
        fechamento: '2026-11-02',
        servicos: [
          { id: 's1', nome: 'Substituição de Feixe de Molas Dianteiro e Grampos', valor: 650 }
        ],
        pecas: [
          { id: 'p1', nome: 'Grampo 3/4x3.1/4 Scania', valor: 140 },
          { id: 'p2', nome: 'Lâmina Mestra Dianteira', valor: 450 }
        ]
      },
      {
        id: 'os_oleo_2',
        num: '1002',
        tenantId: 'tenant_reaperto_1',
        cli: 'cli_frota',
        vei: 'vei_volvo',
        placa: 'VLV9B88',
        st: 'finalizada',
        fechamento: '2026-11-03',
        servicos: [
          { id: 's2', nome: 'Troca de Óleo de Motor e Filtros', valor: 850 }
        ],
        pecas: [
          { id: 'p3', nome: 'Óleo 15W40 Top Turbo', valor: 600 }
        ]
      }
    ],
    veiculos: [
      { id: 'vei_scania', placa: 'SCN1A23', modelo: 'Scania R440', km: 245000 },
      { id: 'vei_volvo', placa: 'VLV9B88', modelo: 'Volvo FH540', km: 180000 }
    ],
    clientes: [
      { id: 'cli_frota', nome: 'Transportes Rápidos Ltda', fone: '11977776666' }
    ],
    opportunities: [],
    afterSales: [],
    auditoria: []
  });

  await t.test('1. Identificação precisa de serviços e peças de feixe de molas e suspensão', () => {
    const state = criarEstadoMock();
    const osMola = state.os.find(o => o.id === 'os_mola_1');
    const osOleo = state.os.find(o => o.id === 'os_oleo_2');

    const diagMola = identificarServicoSuspensaoMolas(osMola);
    const diagOleo = identificarServicoSuspensaoMolas(osOleo);

    assert.equal(diagMola.requerReaperto, true, 'OS com feixe de molas e grampos DEVE requerer reaperto');
    assert.ok(diagMola.termosEncontrados.length > 0);

    assert.equal(diagOleo.requerReaperto, false, 'Troca de óleo NÃO deve requerer reaperto de grampos');
  });

  await t.test('2. Geração da oportunidade preventiva de reaperto gratuito no CRM (D+7 e +500 km)', () => {
    const state = criarEstadoMock();
    const osMola = state.os.find(o => o.id === 'os_mola_1');

    const res = gerarGatilhoReapertoGrampos({
      os: osMola,
      state,
      tenantId: 'tenant_reaperto_1'
    });

    assert.equal(res.ok, true);
    assert.equal(res.gerado, true);
    assert.ok(res.oportunidade);

    // Confere campos da oportunidade no CRM
    const opp = res.oportunidade;
    assert.equal(opp.tipo, 'reaperto_preventivo_grampos');
    assert.equal(opp.placa, 'SCN1A23');
    assert.equal(opp.origemOSNum, '1001');
    assert.equal(opp.gratuito, true);
    assert.equal(opp.valorEstimado, 0);
    // Data de fechamento 2026-11-02 + 7 dias = 2026-11-09
    assert.equal(opp.dataPrevista, '2026-11-09');
    // Km estimado: 245.000 + 500 = 245.500
    assert.equal(opp.kmEstimado, 245500);

    // Oportunidade deve estar gravada em state.opportunities
    assert.equal(state.opportunities.length, 1);
    assert.equal(state.opportunities[0].id, opp.id);
  });

  await t.test('3. Idempotência: reprocessar a mesma OS não duplica a oportunidade no CRM', () => {
    const state = criarEstadoMock();
    const osMola = state.os.find(o => o.id === 'os_mola_1');

    const res1 = gerarGatilhoReapertoGrampos({ os: osMola, state, tenantId: 'tenant_reaperto_1' });
    const res2 = gerarGatilhoReapertoGrampos({ os: osMola, state, tenantId: 'tenant_reaperto_1' });

    assert.equal(res1.gerado, true);
    assert.equal(res2.gerado, false);
    assert.equal(res2.motivo, 'ja_agendado');
    assert.equal(state.opportunities.length, 1, 'Não deve duplicar oportunidade');
  });

  await t.test('4. Formatação de mensagem técnica de garantia e segurança para WhatsApp', () => {
    const msg = formatarMensagemWhatsAppReaperto({
      osNum: '1001',
      placa: 'SCN1A23',
      clienteNome: 'Transportes Rápidos',
      dataReapertoISO: '2026-11-09',
      kmEstimado: 245500
    });

    assert.ok(msg.includes('SCN1A23'), 'Deve conter placa');
    assert.ok(msg.includes('1001'), 'Deve citar OS original');
    assert.ok(msg.includes('500 km'), 'Deve citar os 500 km');
    assert.ok(msg.includes('09/11/2026'), 'Deve conter data formatada em pt-BR');
    assert.ok(msg.includes('gratuito'), 'Deve reforçar que é gratuito');
    assert.ok(msg.includes('garantia'), 'Deve destacar a importância para a garantia');
  });

  await t.test('5. Função avaliarReapertosPreventivos varre todas as OSs finalizadas do tenant', () => {
    const state = criarEstadoMock();

    const resultadoVarredura = avaliarReapertosPreventivos({
      state,
      tenantId: 'tenant_reaperto_1'
    });

    assert.equal(resultadoVarredura.processadas, 2);
    assert.equal(resultadoVarredura.reapertosGerados, 1);
    assert.equal(state.opportunities.length, 1);
  });
});


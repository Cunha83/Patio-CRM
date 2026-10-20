'use strict';

/**
 * tests/homologacao_e2e.test.cjs
 * Frente 11C — Homologação End-to-End (E2E Simulado) para Ambiente Real
 *
 * Simulação completa da jornada operacional em oficina de linha pesada:
 * 1. Abertura de OS e alocação em box de oficina (BOX-01).
 * 2. Apontamento de início de serviço pelo mecânico e requisição de peças com dedução de estoque.
 * 3. Notificação e registro de gargalo operacional (aguardando peça) e posterior desbloqueio/retomada.
 * 4. Vistoria técnica obrigatória e aprovação do Checklist Técnico Pesado (suspensão e freios).
 * 5. Lançamento de sinal de entrada via Pix no caixa e faturamento a prazo do saldo via Boleto (Contas a Receber).
 * 6. Autorização e validação de saída de pátio pela portaria e apuração de comissão do mecânico (expurgando garantia).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs');
const os = require('os');
const http = require('http');

// Banco isolado para este teste de homologação
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio_homolog_'));
const testDb = path.join(tempDir, 'test_homolog.db');
process.env.DB_PATH = testDb;

const express = require('express');
const { initDB, closeDB, all, get } = require('../db');
const financialRouter = require('../routes/financial.routes');
const financialAnalystService = require('../services/financialAnalystService');
const financialEngine = require('../services/financialEngine');
const { salvarEstado, getOrLoadState } = require('../lib/serverContext');

const CTX_GESTOR = {
  tenantId: 'default',
  actorId: 'gestor_001',
  role: 'tenant_admin',
  permissions: ['*'],
  fullName: 'Gestor Operacional'
};

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.securityContext = CTX_GESTOR;
    next();
  });
  app.use(financialRouter);
  return app;
}

async function httpRequest(serverPort, method, routePath, body = {}) {
  const res = await fetch(`http://127.0.0.1:${serverPort}${routePath}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method !== 'GET' ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test('P0: Homologação E2E da Jornada Completa de Linha Pesada (Frente 11C)', { timeout: 60000 }, async (t) => {
  await initDB();

  let server;
  let port;
  const agoraSP = financialEngine.obterAgoraSP();
  const hoje = agoraSP.dataISO;

  // 1. Estado inicial de teste
  const estadoInicial = {
    cfg: {
      adminFones: ['5511999998888'],
      financeiroFones: ['5511977776666'],
      saldoInicial: 1000,
      comandosFinanceirosEscrita: true
    },
    caixas: [
      {
        id: 'cx-homolog-01',
        turno: 1,
        status: 'aberto',
        dataAbertura: hoje,
        horaAbertura: '07:30:00',
        saldoInicial: 1000,
        operadorAbertura: 'gestor_001',
        movimentacoesIds: []
      }
    ],
    movimentos: [],
    movimentacoes: [],
    contas: [],
    os: [
      {
        id: 'OS-900',
        num: 900,
        placa: 'BRA2E19',
        cliente: 'Transportadora TransRodovias',
        veiculo: 'Scania R450 6x2',
        st: 'em_andamento',
        status: 'em_andamento',
        mecanico: 'Marcio Mecanico',
        boxId: null,
        total: 3500,
        valorTotal: 3500,
        totalServicos: 2000,
        totalPecas: 1500,
        servicos: [
          { id: 'srv-1', nome: 'Revisão e Troca de Amortecedores e Buchas Dianteiras', valor: 2000 }
        ],
        pecas: [],
        pecasUtilizadas: []
      },
      // OS em garantia para verificar expurgo na apuração de comissões
      {
        id: 'OS-901-GAR',
        num: 901,
        placa: 'XYZ9876',
        cliente: 'Logística Rápida',
        veiculo: 'Volvo FH 540',
        st: 'finalizada',
        status: 'concluida',
        mecanico: 'Marcio Mecanico',
        total: 1200,
        valorTotal: 1200,
        totalServicos: 1200,
        totalPecas: 0,
        isRetornoGarantia: true,
        servicos: [
          { id: 'srv-gar', nome: 'Reaperto de Feixe de Molas em Garantia', valor: 1200 }
        ],
        dataConclusao: hoje,
        concluidoEm: hoje
      }
    ],
    boxes: [
      { id: 'BOX-01', nome: 'Box 01 - Rampa Pesada', status: 'livre', osId: null }
    ],
    estoque: [
      { id: 'peca-amortecedor', nome: 'Amortecedor Dianteiro Scania R450', quantidade: 4, qtd: 4, qtdAtual: 4, qtdMinima: 2, custo: 450, precoVenda: 750 }
    ],
    mecanicos: [
      { id: 'mec-marcio', nome: 'Marcio Mecanico', fone: '5511999991234' }
    ],
    security_audit_log: []
  };

  await salvarEstado('default', estadoInicial);

  const app = buildApp();
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise(r => server.close(r));
    }
    try { await closeDB(); } catch (_) {}
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  });

  /* ─────────────────────────────────────────────────────────────
     ETAPA 1: Abertura da OS e Alocação em Box de Oficina
     ───────────────────────────────────────────────────────────── */
  await t.test('Etapa 1: Alocação da OS-900 no Box 01 com bloqueio de concorrência', async () => {
    const res = await httpRequest(port, 'POST', '/api/financeiro/os/OS-900/alocar-box', {
      boxId: 'BOX-01',
      mecanico: 'Marcio Mecanico'
    });

    assert.equal(res.status, 200, 'Alocação de box deve retornar 200');
    assert.equal(res.data.success, true);
    assert.equal(res.data.box?.id, 'BOX-01');
    assert.equal(res.data.box?.status, 'ocupado');

    // Valida no estado persistido
    const st = await getOrLoadState({ headers: { 'x-tenant-id': 'default' } });
    const box = st.boxes.find(b => b.id === 'BOX-01');
    assert.equal(box.status, 'ocupado');
    assert.equal(String(box.osId), 'OS-900');
  });

  /* ─────────────────────────────────────────────────────────────
     ETAPA 2: Apontamento de Início e Requisição de Peça com Baixa no Estoque
     ───────────────────────────────────────────────────────────── */
  await t.test('Etapa 2: Apontamento de início e requisição de 2 amortecedores com dedução de estoque', async () => {
    // 2.1 Apontamento de Início
    const resApt = await httpRequest(port, 'POST', '/api/financeiro/os/OS-900/apontamento', {
      acao: 'iniciar',
      mecanico: 'Marcio Mecanico',
      descricao: 'Início da desmontagem e análise do conjunto dianteiro'
    });
    assert.equal(resApt.status, 200, 'Apontamento de início deve responder 200');
    assert.equal(resApt.data.success, true);

    // 2.2 Requisição de 2 amortecedores (estoque tinha 4 unidades)
    const resPeca = await httpRequest(port, 'POST', '/api/financeiro/os/OS-900/requisitar-peca', {
      pecaIdOuNome: 'peca-amortecedor',
      quantidade: 2,
      valorUnitario: 750
    });
    assert.equal(resPeca.status, 200, 'Requisição de peças deve responder 200');
    assert.equal(resPeca.data.success, true);

    // Valida baixa no estoque: 4 - 2 = 2 unidades restantes
    const st = await getOrLoadState({ headers: { 'x-tenant-id': 'default' } });
    const peca = st.estoque.find(p => p.id === 'peca-amortecedor');
    assert.equal(peca.qtdAtual, 2, 'Estoque deve ser reduzido de 4 para 2');

    // Valida peça adicionada na OS
    const os900 = st.os.find(o => String(o.id) === 'OS-900');
    const pecasOS = os900.pecas || os900.pecasUtilizadas || [];
    assert.ok(pecasOS.length > 0, 'Peça deve constar na OS');
  });

  /* ─────────────────────────────────────────────────────────────
     ETAPA 3: Registro de Gargalo Operacional e Retomada
     ───────────────────────────────────────────────────────────── */
  await t.test('Etapa 3: Pausa por gargalo operacional e liberação/retomada de execução', async () => {
    // 3.1 Pausa por gargalo
    const resPausa = await httpRequest(port, 'POST', '/api/financeiro/os/OS-900/apontamento', {
      acao: 'pausar',
      mecanico: 'Marcio Mecanico',
      motivoGargalo: 'Aguardando entrega de buchas adicionais da concessionária'
    });
    assert.equal(resPausa.status, 200, 'Pausa por gargalo deve responder 200');
    assert.equal(resPausa.data.success, true);

    // 3.2 Desbloqueio e Retomada
    const resRetomada = await httpRequest(port, 'POST', '/api/financeiro/os/OS-900/apontamento', {
      acao: 'iniciar',
      mecanico: 'Marcio Mecanico',
      descricao: 'Peças entregues, retomando montagem e alinhamento'
    });
    assert.equal(resRetomada.status, 200, 'Retomada deve responder 200');
    assert.equal(resRetomada.data.success, true);
  });

  /* ─────────────────────────────────────────────────────────────
     ETAPA 4: Vistoria Técnica e Aprovação de Checklist Pesado
     ───────────────────────────────────────────────────────────── */
  await t.test('Etapa 4: Vistoria técnica e aprovação formal do Checklist Pesado (suspensão e freios)', async () => {
    const resChecklist = await httpRequest(port, 'POST', '/api/financeiro/os/OS-900/checklist', {
      modo: 'aprovar',
      observacao: 'Checklist 100% aprovado: grampos com torque nominal de 450 Nm e freios verificados.'
    });

    assert.equal(resChecklist.status, 200, 'Checklist aprovado deve responder 200');
    assert.equal(resChecklist.data.success, true);
    assert.equal(resChecklist.data.statusChecklist, 'aprovado');

    // Valida no estado
    const st = await getOrLoadState({ headers: { 'x-tenant-id': 'default' } });
    const os900 = st.os.find(o => String(o.id) === 'OS-900');
    assert.equal(os900.statusChecklist, 'aprovado');
  });

  /* ─────────────────────────────────────────────────────────────
     ETAPA 5: Sinal via Pix (Entrada) e Faturamento do Saldo via Boleto a Prazo
     ───────────────────────────────────────────────────────────── */
  await t.test('Etapa 5: Sinal de R$ 1.500 no Pix e faturamento a prazo do saldo de R$ 2.000 em Boleto', async () => {
    // 5.1 Registro de Sinal via Pix no Caixa Aberto
    const resSinal = await httpRequest(port, 'POST', '/api/financeiro/movimentacoes', {
      tipo: 'entrada',
      valor: 1500,
      formaPagamento: 'pix',
      categoria: 'Recebimento OS',
      descricao: 'Sinal de 50% OS #900 - Pix Transportadora TransRodovias',
      osId: 'OS-900'
    });
    assert.ok([200, 201].includes(resSinal.status), `Lançamento de sinal deve responder 200 ou 201 (recebido: ${resSinal.status})`);
    assert.equal(resSinal.data.success, true);

    // 5.2 Faturamento do saldo restante (Total R$ 3.500 - Sinal R$ 1.500 = R$ 2.000)
    const resFaturar = await httpRequest(port, 'POST', '/api/financeiro/os/OS-900/faturar', {
      formaPagamento: 'boleto',
      parcelas: 1,
      prazoDias: 28,
      observacao: 'Faturamento a prazo 28 dias via boleto bancário'
    });
    assert.ok([200, 201].includes(resFaturar.status), `Faturamento do saldo restante deve responder 200 ou 201 (recebido: ${resFaturar.status})`);
    assert.equal(resFaturar.data.success, true);

    // Valida criação do título em Contas a Receber
    const st = await getOrLoadState({ headers: { 'x-tenant-id': 'default' } });
    const titulos = (st.contas || []).filter(c => String(c.osId) === 'OS-900' || String(c.os) === 'OS-900');
    assert.ok(titulos.length > 0, 'Deve gerar título a receber para a OS');
    const valorTitulo = titulos.reduce((acc, t) => acc + Number(t.valor || 0), 0);
    assert.equal(valorTitulo, 2000, 'Título a receber deve ser exatamente o saldo faturado de R$ 2.000');
  });

  /* ─────────────────────────────────────────────────────────────
     ETAPA 6: Liberação de Portaria de Pátio e Apuração de Comissões com Expurgo de Garantia
     ───────────────────────────────────────────────────────────── */
  await t.test('Etapa 6: Liberação de saída na portaria (faturado a prazo) e apuração de comissões', async () => {
    // 6.1 Liberação de Saída de Pátio (OS faturada a prazo deve ser autorizada: liberado_faturado)
    const resSaida = await httpRequest(port, 'POST', '/api/financeiro/os/OS-900/liberar-saida', {});
    assert.equal(resSaida.status, 200, 'Liberação de saída deve responder 200');
    assert.equal(resSaida.data.success, true);
    assert.equal(resSaida.data.autorizado, true);
    assert.equal(resSaida.data.statusLiberacaoPatio, 'liberado_faturado');

    // Desocupa o box após a saída do veículo
    await httpRequest(port, 'POST', '/api/financeiro/os/OS-900/liberar-box', {});

    // Finaliza a OS no pátio via apontamento do mecânico
    const resFinalizar = await httpRequest(port, 'POST', '/api/financeiro/os/OS-900/apontamento', {
      acao: 'finalizar',
      mecanico: 'Marcio Mecanico',
      descricao: 'Serviço concluído e veículo pronto para entrega'
    });
    assert.equal(resFinalizar.status, 200, 'Finalização da OS deve responder 200');

    // 6.2 Apuração de Produtividade e Comissões
    const resBI = await httpRequest(port, 'GET', `/api/financeiro/patio/produtividade?periodo=mensal&dataRef=${hoje}`);
    assert.equal(resBI.status, 200, 'Cálculo de produtividade/comissão deve responder 200');
    assert.equal(resBI.data.success, true);

    const produtividadeMecanicos = resBI.data.produtividadeMecanicos || [];
    assert.ok(produtividadeMecanicos.length > 0, 'Lista de produtividade de mecânicos deve estar presente');

    // Mecânico Marcio:
    // OS-900 (Mão de obra R$ 2.000 -> Comissionável 20% = R$ 400)
    // OS-901-GAR (Mão de obra R$ 1.200 -> Retorno Garantia -> Base comissionável = R$ 0)
    const mecMarcio = produtividadeMecanicos.find(m => (m.mecanico || m.nome || '').toLowerCase().includes('marcio'));
    assert.ok(mecMarcio, 'Mecânico Marcio deve estar no ranking de produtividade');
    assert.equal(mecMarcio.totalGarantias, 1, 'Deve identificar 1 retorno de garantia expurgado');
    assert.equal(mecMarcio.maoDeObraComissionavel, 2000, 'Base comissionável deve ser de apenas R$ 2.000 (expurgando R$ 1.200 de garantia)');
    assert.equal(mecMarcio.valorComissao, 400, 'Comissão apurada (20% de R$ 2.000) deve ser R$ 400');

    // 6.3 Auditoria Completa no SQLite
    const auditLogs = await all('SELECT action, entity, entity_id FROM security_audit_log WHERE tenant_id = ? ORDER BY id ASC', ['default']);
    const acoes = auditLogs.map(l => l.action);

    assert.ok(acoes.some(a => a.includes('alocar_box')), 'Deve ter log de alocação de box');
    assert.ok(acoes.some(a => a.includes('apontamento')), 'Deve ter log de apontamento');
    assert.ok(acoes.some(a => a.includes('requisitar_peca')), 'Deve ter log de requisição de peças');
    assert.ok(acoes.some(a => a.includes('checklist_tecnico')), 'Deve ter log de checklist técnico');
    assert.ok(acoes.some(a => a.includes('faturar')), 'Deve ter log de faturamento');

    // Verificação de integridade estrutural SQLite
    const integrity = await get('PRAGMA integrity_check');
    assert.equal(integrity.integrity_check, 'ok', 'Banco SQLite deve manter 100% de integridade');
  });
});

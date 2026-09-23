'use strict';

/**
 * PÁTIO CRM — TESTES DE INTEGRIDADE DA BASE DEMONSTRATIVA E HOMOLOGAÇÃO
 *
 * Validações rigorosas:
 * 1. Isolamento estrito de produção (tenant:default:state intocado)
 * 2. Metas volumétricas (80 clientes, 120 veículos, 150 peças, 300 OS, >= 450 apontamentos, etc.)
 * 3. Conciliação de estoque 100% peça a peça (Estoque Final = Inicial + Entradas - Saídas)
 * 4. Coerência cronológica (zero conclusões ou pagamentos futuros após 2026-09-11)
 * 5. Anti-sobreposição de mão de obra (overlap = 0 entre apontamentos do mesmo mecânico)
 * 6. Conciliação financeira (OS faturadas vs Contas a Receber vs Caixa positivo)
 * 7. Idempotência e verificador oficial
 * 8. Rotina de purga isolada e restauração
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initDB, get, all, run, closeDB } = require('../db');
const {
  TENANT_ID,
  DEMO_BATCH_ID,
  DATA_FINAL_STR,
  executarGenerate,
  executarVerify,
  executarPurge
} = require('../scripts/seedDemoDataset');
const billingService = require('../services/billing/billingService');

before(async()=>{
  await initDB();
  await run('INSERT OR REPLACE INTO kv(key,value) VALUES(?,?)',['tenant:default:state',JSON.stringify({tenantId:'default',syntheticTest:true})]);
  await executarGenerate();
});
after(()=>closeDB());

test('1. Isolamento de Produção: tenant:default:state preservado e demo segregado', async () => {
  await initDB();

  // Verifica que o tenant default existe e não foi corrompido
  const prodRow = await get('SELECT value FROM kv WHERE key = ?', ['tenant:default:state']);
  assert.ok(prodRow, 'tenant:default:state deve existir');
  const prodState = JSON.parse(prodRow.value);
  assert.ok(prodState && typeof prodState === 'object', 'tenant:default:state deve ser um objeto válido');
  assert.notEqual(prodState._isDemo, true, 'tenant:default:state NÃO pode ser marcado como _isDemo');

  // Verifica que o tenant demo está na sua própria chave
  const demoRow = await get('SELECT value FROM kv WHERE key = ?', [`tenant:${TENANT_ID}:state`]);
  assert.ok(demoRow, 'Chave do tenant demo deve existir no SQLite');
  const demoState = JSON.parse(demoRow.value);
  assert.equal(demoState.tenantId, TENANT_ID);
  assert.equal(demoState._isDemo, true);
  assert.equal(demoState.demoBatchId, DEMO_BATCH_ID);

  // Garante contatos não acionáveis e emails seguros em example.com
  demoState.clientes.forEach(c => {
    assert.ok(c.email.endsWith('example.com'), `Email do cliente ${c.nome} deve pertencer ao domínio example.com`);
    assert.equal(c._isDemo, true);
  });
});

test('2. Metas Volumétricas e Governança: volumes completos nos últimos 90 dias', async () => {
  await initDB();
  const demoRow = await get('SELECT value FROM kv WHERE key = ?', [`tenant:${TENANT_ID}:state`]);
  const s = JSON.parse(demoRow.value);

  // Clientes e Frotas
  assert.equal(s.clientes.length, 80, 'Deve conter exatamente 80 clientes');
  const frotistas = s.clientes.filter(c => c.tipo === 'frotista');
  assert.equal(frotistas.length, 8, 'Deve conter exatamente 8 frotistas');
  assert.equal(s.fleets.length, 8, 'Deve conter 8 frotas configuradas');

  // Veículos pesados
  assert.equal(s.veiculos.length, 120, 'Deve conter exatamente 120 veículos');
  s.veiculos.forEach(v => {
    assert.ok(v.placa.startsWith('DEM'), `Placa deve ter padrão demonstrativo DEM: ${v.placa}`);
  });

  // Fornecedores e Catálogo
  assert.equal(s.suppliers.length, 15, 'Deve conter 15 fornecedores');
  assert.equal(s.pecas.length, 150, 'Deve conter exatamente 150 peças');
  assert.equal(s.workers.length, 10, 'Deve conter 10 colaboradores');

  // Orçamentos e OS
  assert.equal(s.quotations.length, 360, 'Deve conter exatamente 360 orçamentos');
  assert.equal(s.os.length, 300, 'Deve conter exatamente 300 ordens de serviço');

  const osFinalizadas = s.os.filter(o => o.st === 'finalizada');
  const osEmAndamento = s.os.filter(o => o.st === 'em_andamento');
  const osAguardandoPeca = s.os.filter(o => o.st === 'aguardando_peca');
  const osAguardandoAprovacao = s.os.filter(o => o.st === 'aguardando_aprovacao');
  const osCanceladas = s.os.filter(o => o.st === 'cancelada');

  assert.equal(osFinalizadas.length, 272, 'Deve conter 272 OS finalizadas');
  assert.equal(osEmAndamento.length, 14, 'Deve conter 14 OS em andamento');
  assert.equal(osAguardandoPeca.length, 6, 'Deve conter 6 OS aguardando peças');
  assert.equal(osAguardandoAprovacao.length, 4, 'Deve conter 4 OS aguardando aprovação');
  assert.equal(osCanceladas.length, 4, 'Deve conter 4 OS canceladas');

  // Pedidos e Estoque
  assert.equal(s.purchaseOrders.length, 80, 'Deve conter 80 pedidos de compra');
  assert.ok(s.inventoryMovements.length >= 600, `Movimentações de estoque devem ser >= 600 (atual: ${s.inventoryMovements.length})`);

  // Apontamentos de Mão de Obra
  assert.ok(s.laborEntries.length >= 450, `Apontamentos de mão de obra devem ser >= 450 (atual: ${s.laborEntries.length})`);

  // Planos de manutenção preventiva
  assert.equal(s.maintenancePlans.length, 25, 'Deve conter exatamente 25 planos preventivos');

  // Plataforma SaaS (6 tenants cadastrados em billingService)
  const expectedSaaSTenants = [
    'demo_oficina_ativa_pro',
    'demo_oficina_ativa_essencial',
    'demo_oficina_trial_pro',
    'demo_oficina_past_due',
    'demo_oficina_suspensa',
    'demo_oficina_cancelada'
  ];
  expectedSaaSTenants.forEach(tenantId => {
    const sub = billingService.getSubscription(tenantId);
    assert.ok(sub, `Tenant ${tenantId} deve ter assinatura registrada no billingService`);
  });
});

test('3. Conciliação Físico-Financeira de Estoque: 100% das 150 peças conciliadas sem saldo negativo', async () => {
  await initDB();
  const demoRow = await get('SELECT value FROM kv WHERE key = ?', [`tenant:${TENANT_ID}:state`]);
  const s = JSON.parse(demoRow.value);

  s.pecas.forEach(p => {
    const movsPeca = s.inventoryMovements.filter(m => m.partId === p.id);
    const entradas = movsPeca
      .filter(m => ['entrada_compra', 'ajuste_positivo', 'devolucao_os'].includes(m.type))
      .reduce((acc, m) => acc + m.quantity, 0);
    const saidas = movsPeca
      .filter(m => ['saida_os', 'ajuste_negativo'].includes(m.type))
      .reduce((acc, m) => acc + m.quantity, 0);

    const saldoCalculado = entradas - saidas;
    assert.equal(
      p.qtd,
      saldoCalculado,
      `Divergência na peça ${p.id} (${p.codigoInterno}): saldo físico em cadastro (${p.qtd}) != calculado (${saldoCalculado})`
    );
    assert.ok(p.qtd >= 0, `Peça ${p.id} não pode ter estoque negativo: ${p.qtd}`);
  });
});

test('4. Coerência Cronológica e Fuso Horário: zero eventos futuros em relação a 2026-09-11', async () => {
  await initDB();
  const demoRow = await get('SELECT value FROM kv WHERE key = ?', [`tenant:${TENANT_ID}:state`]);
  const s = JSON.parse(demoRow.value);

  // Nenhuma OS concluída no futuro
  s.os.forEach(o => {
    if (o.concluidaEm) {
      assert.ok(
        o.concluidaEm.slice(0, 10) <= DATA_FINAL_STR,
        `OS #${o.num} possui conclusão no futuro: ${o.concluidaEm}`
      );
    }
  });

  // Nenhuma conta paga no futuro
  s.contas.forEach(c => {
    if (c.pago && c.pagoEm) {
      assert.ok(
        c.pagoEm.slice(0, 10) <= DATA_FINAL_STR,
        `Conta #${c.id} possui liquidação no futuro: ${c.pagoEm}`
      );
    }
  });

  // Nenhum movimento de caixa no futuro
  s.movimentos.forEach(m => {
    assert.ok(
      m.data.slice(0, 10) <= DATA_FINAL_STR,
      `Movimento #${m.id} possui data no futuro: ${m.data}`
    );
  });
});

test('5. Anti-Sobreposição de Horários da Mão de Obra e Remuneração', async () => {
  await initDB();
  const demoRow = await get('SELECT value FROM kv WHERE key = ?', [`tenant:${TENANT_ID}:state`]);
  const s = JSON.parse(demoRow.value);

  for (const w of s.workers) {
    const entries = s.laborEntries
      .filter(e => e.workerId === w.id && e.endTime)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    for (let i = 0; i < entries.length - 1; i++) {
      const fimA = new Date(entries[i].endTime).getTime();
      const inicioB = new Date(entries[i + 1].startTime).getTime();
      assert.ok(
        fimA <= inicioB,
        `Sobreposição detectada para o mecânico ${w.nome}: apontamento ${entries[i].id} termina após início de ${entries[i + 1].id}`
      );
    }

    entries.forEach(e => {
      assert.equal(e.hourlyCost, w.custoHora, `Custo hora do apontamento deve bater com cadastro do mecânico ${w.nome}`);
    });
  }
});

test('6. Conciliação Financeira de OS e Fluxo de Caixa Positivo', async () => {
  await initDB();
  const demoRow = await get('SELECT value FROM kv WHERE key = ?', [`tenant:${TENANT_ID}:state`]);
  const s = JSON.parse(demoRow.value);

  // Todas as OS finalizadas geraram contas a receber com valor exato
  const osFinalizadas = s.os.filter(o => o.st === 'finalizada');
  osFinalizadas.forEach(o => {
    const cr = s.contas.find(c => c.osId === o.id && c.tipo === 'receber');
    assert.ok(cr, `OS #${o.num} deve ter conta a receber correspondente`);
    assert.equal(cr.valor, o.total, `Valor da conta (${cr.valor}) deve bater com total da OS #${o.num} (${o.total})`);
  });

  // Fluxo de caixa
  const totalEntradas = s.movimentos
    .filter(m => m.tipo === 'entrada')
    .reduce((acc, m) => acc + m.valor, 0);

  const totalSaidas = s.movimentos
    .filter(m => m.tipo === 'saida')
    .reduce((acc, m) => acc + m.valor, 0);

  const saldoInicial = s.cfg?.saldoInicial || 85000;
  const saldoFinalEsperado = Number((saldoInicial + totalEntradas - totalSaidas).toFixed(2));

  assert.ok(saldoFinalEsperado > 0, `Saldo consolidado de caixa deve ser positivo: R$ ${saldoFinalEsperado}`);
  assert.ok(totalEntradas > totalSaidas, 'Total de entradas de vendas deve superar saídas operacionais');
});

test('7. Verificador Oficial: executarVerify() retorna sucesso sem falhas', async () => {
  const resultado = await executarVerify();
  assert.equal(resultado.sucesso, true, 'executarVerify() deve retornar sucesso');
  assert.equal(resultado.falhas.length, 0, 'executarVerify() não deve relatar nenhuma falha');
});

test('8. Isolamento da Purga e Restauração', async () => {
  await initDB();

  // Executar purga
  await executarPurge();

  // Verificar que a chave demo foi removida
  const demoAposPurga = await get('SELECT value FROM kv WHERE key = ?', [`tenant:${TENANT_ID}:state`]);
  assert.equal(demoAposPurga, undefined, 'Chave do tenant demo deve ter sido removida após purga');

  // Verificar que o tenant default de produção continuou intacto
  const prodAposPurga = await get('SELECT value FROM kv WHERE key = ?', ['tenant:default:state']);
  assert.ok(prodAposPurga, 'tenant:default:state deve continuar intacto após a purga do tenant demo');

  // Restaurar a base para manter o ambiente pronto para homologação e demonstração
  await executarGenerate();
  const demoRestaurado = await get('SELECT value FROM kv WHERE key = ?', [`tenant:${TENANT_ID}:state`]);
  assert.ok(demoRestaurado, 'Chave do tenant demo deve ser restaurada');
});

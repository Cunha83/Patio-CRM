'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');

const executiveManagerService = require('../services/executiveManagerService');
const voiceActionEngine = require('../services/voiceActionEngine');
const maintenancePlanService = require('../services/maintenancePlanService');

test('Verônica Gestora 360º: Suprimentos, Produtividade, Frotas, Voz, RBAC e WhatsApp', { timeout: 60000 }, async (t) => {

  // ─────────────────────────────────────────────────────────────────
  // 1. TESTES UNITÁRIOS DE COMPRAS & ESTOQUE CRÍTICO
  // ─────────────────────────────────────────────────────────────────

  await t.test('1. Compras & Estoque Crítico cruzado com Saldo e Forecast 15d', () => {
    const state = {
      tenantId: 'tenant_test',
      pecas: [
        { id: 'p1', cod: 'MOL-01', nome: 'Mola Dianteira Scania', qtd: 1, min: 4, custo: 300, forn: 'Molas Brasil' },
        { id: 'p2', cod: 'BUC-02', nome: 'Bucha de Suspensão', qtd: 0, min: 6, custo: 40, forn: 'Suspensys' },
        { id: 'p3', cod: 'GRA-03', nome: 'Graxa Grafitada', qtd: 2, min: 5, custo: 25, forn: 'Lubrax' },
        { id: 'p4', cod: 'FIL-04', nome: 'Filtro Combustível', qtd: 10, min: 3, custo: 60, forn: 'Donaldson' } // Estoque ok
      ],
      os: [
        {
          id: 'os_101',
          num: 101,
          st: 'executando',
          vei: 'ABC1D23',
          cli: 'Transportadora Falcão',
          pecas: [
            { pecaId: 'p1', cod: 'MOL-01', nome: 'Mola Dianteira Scania', qtd: 3 } // Estoque tem 1, precisa de 3 -> deficit 2
          ]
        },
        {
          id: 'os_102',
          num: 102,
          st: 'finalizada', // OS finalizada não demanda mais estoque
          pecas: [
            { pecaId: 'p2', qtd: 5 }
          ]
        }
      ],
      contas: [
        { id: 'c1', tipo: 'receber', valor: 8000, venc: '2026-10-20', pago: false },
        { id: 'c2', tipo: 'pagar', valor: 2000, venc: '2026-10-22', pago: false }
      ],
      caixas: [
        { id: 'cx1', status: 'aberto', saldoAtual: 5000 }
      ],
      cfg: { caixaMinimoSeguranca: 1500 }
    };

    // Cenário A: Folga financeira suficiente para todas as compras
    const analiseA = executiveManagerService.analisarComprasEEstoque(state, { tenantId: 'tenant_test' });

    assert.equal(analiseA.sucesso, true);
    assert.equal(analiseA.resumo.totalItensNecessidade, 3); // p1, p2, p3
    assert.equal(analiseA.resumo.totalItensCriticosOS, 1); // p1 tem déficit imediato na OS 101
    assert.equal(analiseA.resumo.totalItensZerados, 1); // p2 zerada

    const itemP1 = analiseA.itens.find(i => i.pecaId === 'p1');
    assert.ok(itemP1);
    assert.equal(itemP1.prioridade, 'urgente');
    assert.equal(itemP1.deficitOS, 2);
    assert.equal(itemP1.qtdSugerida, 6); // 2 de déficit + 4 de estoque mínimo
    assert.equal(itemP1.custoTotalEstimado, 1800); // 6 * 300
    assert.equal(analiseA.resumo.custoOSUrgente, 600); // 2 faltantes na OS * 300

    assert.equal(analiseA.financeiro.statusViabilidade, 'liberado_total');
    assert.equal(analiseA.financeiro.podeComprarTotal, true);
    assert.equal(analiseA.financeiro.podeComprarUrgente, true);

    // Cenário B: Folga apertada (Cobre as peças urgentes da OS, mas não a recomposição total)
    state.caixas[0].saldoAtual = 1000; // Saldo de 1000: cobre 600 (custo urgente), mas não 2115 (total) com reserva de 1500
    const analiseB = executiveManagerService.analisarComprasEEstoque(state, { tenantId: 'tenant_test' });
    assert.equal(analiseB.financeiro.statusViabilidade, 'liberado_parcial_os');
    assert.equal(analiseB.financeiro.podeComprarTotal, false);
    assert.equal(analiseB.financeiro.podeComprarUrgente, true);

    // Cenário C: Restrição severa de caixa (não cobre nem a peça urgente da OS)
    state.caixas[0].saldoAtual = 300; // 300 < 600
    const analiseC = executiveManagerService.analisarComprasEEstoque(state, { tenantId: 'tenant_test' });
    assert.equal(analiseC.financeiro.statusViabilidade, 'restringido_caixa');
    assert.equal(analiseC.financeiro.podeComprarTotal, false);
    assert.equal(analiseC.financeiro.podeComprarUrgente, false);
  });

  // ─────────────────────────────────────────────────────────────────
  // 2. TESTES UNITÁRIOS DE PRODUTIVIDADE DE EQUIPE E BOXES
  // ─────────────────────────────────────────────────────────────────

  await t.test('2. Produtividade da Equipe Técnica, Apontamentos e Boxes', () => {
    const state = {
      tenantId: 'tenant_test',
      workers: [
        { id: 'w1', nome: 'Sebastião Mecânico', funcao: 'Mecânico Diesel', jornadaHorasDia: 8, ativo: true },
        { id: 'w2', nome: 'Roberto Eletricista', funcao: 'Eletricista Auto', jornadaHorasDia: 8, ativo: true },
        { id: 'w3', nome: 'Antônio Ajudante', funcao: 'Auxiliar', jornadaHorasDia: 8, ativo: true }
      ],
      laborEntries: [
        { id: 'le1', workerId: 'w1', osId: 'os_201', durationMinutes: 240, type: 'produtivo' }, // 4h
        { id: 'le2', workerId: 'w1', osId: 'os_202', durationMinutes: 120, type: 'produtivo' }, // 2h -> 6h prod
        { id: 'le3', workerId: 'w2', osId: 'os_203', durationMinutes: 480, type: 'produtivo' }, // 8h
        { id: 'le4', workerId: 'w2', osId: 'os_203', durationMinutes: 120, type: 'produtivo' }  // +2h = 10h -> sobrecarga
      ],
      os: [
        {
          id: 'os_201',
          st: 'executando',
          box: 'Box 01',
          servicos: [{ mecanicoId: 'w1', valor: 900, nome: 'Troca de Feixe de Molas' }]
        },
        {
          id: 'os_202',
          st: 'executando',
          box: 'Box 02',
          servicos: [{ mecanicoId: 'w1', valor: 600, nome: 'Solda e Reforço' }]
        },
        {
          id: 'os_203',
          st: 'executando',
          box: 'Box 03',
          servicos: [{ mecanicoId: 'w2', valor: 1800, nome: 'Revisão Elétrica Completa' }]
        }
      ],
      boxes: [
        { id: 'b1', nome: 'Box 01', tipo: 'Valeta' },
        { id: 'b2', nome: 'Box 02', tipo: 'Elevador' },
        { id: 'b3', nome: 'Box 03', tipo: 'Pátio Coberto' },
        { id: 'b4', nome: 'Box 04', tipo: 'Livre' }
      ]
    };

    const analise = executiveManagerService.analisarProdutividadeEquipe(state, { tenantId: 'tenant_test' });

    assert.equal(analise.sucesso, true);
    assert.equal(analise.resumo.totalMecanicos, 3);
    assert.equal(analise.resumo.totalBoxes, 4);
    assert.equal(analise.resumo.boxesOcupados, 3);
    assert.equal(analise.resumo.boxesLivres, 1);
    assert.equal(analise.resumo.taxaOcupacaoBoxes, 75);

    // Roberto gerou 1800 e Sebastião gerou 1500 (900+600)
    assert.equal(analise.resumo.totalReceitaMaoDeObra, 3300);
    assert.equal(analise.resumo.mecanicoDestaque.nome, 'Roberto Eletricista');
    assert.equal(analise.resumo.mecanicoDestaque.receita, 1800);

    // Carga de trabalho
    assert.equal(analise.resumo.totalSobrecarregados, 1); // Roberto com 10h > 9h
    assert.equal(analise.resumo.totalOciosos, 1); // Antônio com 0h e 0 OSs
  });

  // ─────────────────────────────────────────────────────────────────
  // 3. TESTES UNITÁRIOS DE RETENÇÃO DE FROTAS E COBRANÇA
  // ─────────────────────────────────────────────────────────────────

  await t.test('3. Inteligência Comercial, Ranking de Frotas e Cobrança Proativa', () => {
    const state = {
      tenantId: 'tenant_test',
      clientes: [
        { id: 'cli_1', nome: 'Transvale Transportes' },
        { id: 'cli_2', nome: 'Rodoviário Estrela' }
      ],
      veiculos: [
        { id: 'vei_1', placa: 'AAA1111', modelo: 'Volvo FH 540', km: 120000 },
        { id: 'vei_2', placa: 'BBB2222', modelo: 'Scania R450', km: 250000 }
      ],
      maintenancePlans: [
        {
          id: 'pln_1',
          tenantId: 'tenant_test',
          name: 'Plano Troca de Óleo',
          vehicleId: 'vei_1',
          active: true,
          items: [
            {
              id: 'it_1',
              description: 'Troca de Óleo do Motor e Filtros',
              intervalKm: 20000,
              lastServiceKm: 95000, // 95.000 + 20.000 = 115.000 -> km 120.000 = VENCIDO
              lastServiceDate: '2026-01-01',
              status: 'vencido'
            }
          ]
        }
      ],
      contas: [
        { id: 'ct_1', tipo: 'receber', cli: 'Transvale Transportes', valor: 4500, venc: '2026-10-01', pago: false }, // Vencido
        { id: 'ct_2', tipo: 'receber', cli: 'Rodoviário Estrela', valor: 1200, venc: '2026-11-15', pago: false } // A vencer
      ],
      os: [
        { id: 'os_1', cli: 'Transvale Transportes', vei: 'AAA1111', total: 12000, st: 'finalizada' },
        { id: 'os_2', cli: 'Transvale Transportes', vei: 'AAA1111', total: 6000, st: 'executando' },
        { id: 'os_3', cli: 'Rodoviário Estrela', vei: 'BBB2222', total: 3500, st: 'finalizada' }
      ]
    };

    const analise = executiveManagerService.analisarRetencaoECobranca(state, {
      tenantId: 'tenant_test',
      dataReferencia: '2026-10-16'
    });

    assert.equal(analise.sucesso, true);
    assert.equal(analise.resumo.totalClientesMapeados, 2);
    assert.equal(analise.rankingClientes[0].clienteNome, 'Transvale Transportes');
    assert.equal(analise.rankingClientes[0].faturamentoTotal, 18000);
    assert.equal(analise.rankingClientes[0].totalReceberVencido, 4500);

    // Oportunidades comerciais geradas
    assert.ok(analise.oportunidadesAcao.length > 0);
    const opTransvale = analise.oportunidadesAcao.find(o => o.cliente === 'Transvale Transportes');
    assert.ok(opTransvale);
    assert.equal(opTransvale.tipo, 'cobranca_preventiva');
    assert.equal(opTransvale.prioridade, 'urgente');
  });

  // ─────────────────────────────────────────────────────────────────
  // 4. TESTES UNITÁRIOS DO BRIEFING EXECUTIVO 360º
  // ─────────────────────────────────────────────────────────────────

  await t.test('4. Relatório Gerencial 360º Estruturado, WhatsApp e Síntese de Voz', () => {
    const state = {
      tenantId: 'tenant_test',
      pecas: [
        { id: 'p1', cod: 'MOL-01', nome: 'Mola Scania', qtd: 0, min: 2, custo: 200 }
      ],
      workers: [
        { id: 'w1', nome: 'Marcos Mecânico', jornadaHorasDia: 8, ativo: true }
      ],
      laborEntries: [
        { id: 'le1', workerId: 'w1', osId: 'os_1', durationMinutes: 180, type: 'produtivo' }
      ],
      os: [
        {
          id: 'os_1',
          num: 1,
          st: 'executando',
          box: 'Box 01',
          cli: 'Transportes Brasil',
          servicos: [{ mecanicoId: 'w1', valor: 850 }]
        }
      ],
      boxes: [
        { id: 'b1', nome: 'Box 01' },
        { id: 'b2', nome: 'Box 02' }
      ],
      contas: [
        { id: 'c1', tipo: 'receber', valor: 3000, venc: '2026-10-25', pago: false }
      ],
      caixas: [
        { id: 'cx1', status: 'aberto', saldoAtual: 4000 }
      ],
      cfg: { caixaMinimoSeguranca: 1000 }
    };

    const relatorio = executiveManagerService.gerarRelatorioGerencial360(state, { tenantId: 'tenant_test' });

    assert.equal(relatorio.sucesso, true);
    assert.ok(relatorio.diagnosticoEstruturado);
    assert.equal(relatorio.diagnosticoEstruturado.patio.boxesOcupados, 1);
    assert.equal(relatorio.diagnosticoEstruturado.patio.totalBoxes, 2);
    assert.equal(relatorio.diagnosticoEstruturado.financeiro.saldoAtual, 4000);
    assert.equal(relatorio.diagnosticoEstruturado.comprasEEstoque.totalItensSugeridos, 1);
    assert.equal(relatorio.diagnosticoEstruturado.equipe.totalMecanicos, 1);

    // Texto WhatsApp
    assert.ok(relatorio.textoWhatsApp.includes('RELATÓRIO GERENCIAL 360º'));
    assert.ok(relatorio.textoWhatsApp.includes('1. Pátio & Ocupação de Boxes'));
    assert.ok(relatorio.textoWhatsApp.includes('2. Tesouraria & Previsão'));
    assert.ok(relatorio.textoWhatsApp.includes('3. Suprimentos & Compras Sugeridas'));
    assert.ok(relatorio.textoWhatsApp.includes('4. Produtividade da Equipe'));

    // Texto de Voz (TTS)
    assert.ok(relatorio.textoVoz.includes('Raio-X Gerencial 360'));
    assert.ok(relatorio.textoVoz.includes('boxes'));
  });

  // ─────────────────────────────────────────────────────────────────
  // 5. TESTES DE RECONHECIMENTO DE INTENÇÕES E EXECUÇÃO DE VOZ
  // ─────────────────────────────────────────────────────────────────

  await t.test('5. Comandos de Voz da Verônica (Intenções e Respostas Faladas)', async () => {
    const state = {
      tenantId: 'tenant_voice',
      pecas: [
        { id: 'p1', cod: 'CIL-01', nome: 'Cilindro de Freio', qtd: 0, min: 3, custo: 150 }
      ],
      workers: [
        { id: 'w1', nome: 'Damião', jornadaHorasDia: 8, ativo: true }
      ],
      laborEntries: [
        { id: 'le1', workerId: 'w1', osId: 'os_v1', durationMinutes: 300, type: 'produtivo' }
      ],
      os: [
        { id: 'os_v1', st: 'executando', box: 'Box 01', servicos: [{ mecanicoId: 'w1', valor: 750 }] }
      ],
      boxes: [{ id: 'b1', nome: 'Box 01' }],
      caixas: [{ id: 'cx1', status: 'aberto', saldoAtual: 2500 }],
      cfg: { caixaMinimoSeguranca: 1000 }
    };

    const contextAdmin = {
      tenantId: 'tenant_voice',
      role: 'admin',
      permissions: ['*'],
      actorId: 'admin_test'
    };

    // A. "relatório gerencial 360" / "raio x da oficina"
    const inter360 = await voiceActionEngine.interpretarComando({
      input: { text: 'Verônica, me dá o relatório gerencial 360 e raio x da oficina' },
      state
    });
    assert.equal(inter360.intencao, 'consultar_gestao_360');

    const exec360 = await voiceActionEngine.executarAcao({
      interpretado: inter360,
      input: { text: 'relatório gerencial 360' },
      context: contextAdmin,
      state
    });
    assert.equal(exec360.ok, true);
    assert.equal(exec360.acao, 'consultar_gestao_360');
    assert.ok(exec360.resposta.includes('Raio-X Gerencial 360'));

    // B. "o que precisa comprar no estoque" / "sugestão de compras"
    const interCompras = await voiceActionEngine.interpretarComando({
      input: { text: 'Verônica, o que precisa comprar no estoque? Qual a sugestão de compras?' },
      state
    });
    assert.equal(interCompras.intencao, 'consultar_compras_sugeridas');

    const execCompras = await voiceActionEngine.executarAcao({
      interpretado: interCompras,
      input: { text: 'o que precisa comprar no estoque' },
      context: contextAdmin,
      state
    });
    assert.equal(execCompras.ok, true);
    assert.equal(execCompras.acao, 'consultar_compras_sugeridas');
    assert.ok(execCompras.resposta.includes('Análise de Compras'));

    // C. "produtividade da equipe" / "ranking dos mecânicos"
    const interEquipe = await voiceActionEngine.interpretarComando({
      input: { text: 'Verônica, como está a produtividade da equipe e o ranking dos mecânicos?' },
      state
    });
    assert.equal(interEquipe.intencao, 'consultar_produtividade_equipe');

    const execEquipe = await voiceActionEngine.executarAcao({
      interpretado: interEquipe,
      input: { text: 'produtividade da equipe' },
      context: contextAdmin,
      state
    });
    assert.equal(execEquipe.ok, true);
    assert.equal(execEquipe.acao, 'consultar_produtividade_equipe');
    assert.ok(execEquipe.resposta.includes('Produtividade da Equipe'));
  });

  // ─────────────────────────────────────────────────────────────────
  // 6. TESTES HTTP REST COM RBAC (/API/OPERACAO/*)
  // ─────────────────────────────────────────────────────────────────

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-exec-manager-test-'));
  const dbPath = path.join(tempDir, 'test.db');
  const uploadDir = path.join(tempDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  process.env.TOKEN_SECRET = 'segredo-teste-hmac-exec-2026';
  process.env.DB_PATH = dbPath;

  const db = require('../db');
  await db.initDB();

  const userRepo = require('../lib/auth/userRepository');
  await userRepo.createUser({
    username: 'admin_exec',
    email: 'admin@exec.com',
    password: 'SenhaAdminExec#2026',
    role: 'admin',
    tenantId: 'tenant_exec_test',
    fullName: 'Administrador Executivo'
  });

  await userRepo.createUser({
    username: 'user_restrito',
    email: 'restrito@exec.com',
    password: 'SenhaUserRestrito#2026',
    role: 'mecanico',
    tenantId: 'tenant_exec_test',
    fullName: 'Mecânico Sem Permissão Operacional'
  });

  const mockTenantState = {
    versao: 1,
    pecas: [
      { id: 'p_http_1', cod: 'CIL-99', nome: 'Cilindro Mestre', qtd: 1, min: 3, custo: 180, forn: 'Varga' }
    ],
    workers: [
      { id: 'w_http_1', nome: 'Mecânico HTTP', jornadaHorasDia: 8, ativo: true }
    ],
    laborEntries: [
      { id: 'le_http_1', workerId: 'w_http_1', osId: 'os_http_1', durationMinutes: 120, type: 'produtivo' }
    ],
    os: [
      { id: 'os_http_1', num: 901, st: 'executando', box: 'Box 01', total: 2500 }
    ],
    boxes: [{ id: 'b_http_1', nome: 'Box 01' }],
    contas: [{ id: 'c_http_1', tipo: 'receber', valor: 4000, venc: '2026-10-30', pago: false }],
    caixas: [{ id: 'cx_http_1', status: 'aberto', saldoAtual: 6000 }],
    cfg: { caixaMinimoSeguranca: 1500 }
  };

  const { persistState } = require('../lib/repository/stateRepository');
  await persistState({ tenantId: 'tenant_exec_test', role: 'admin', permissions: ['*'], actorId: 'seed' }, mockTenantState);
  await db.closeDB();

  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(r => probe.close(r));

  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    windowsHide: true,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      API_KEY: 'master-exec-test-key',
      DB_PATH: dbPath,
      UPLOAD_DIR: uploadDir,
      DISABLE_WHATSAPP: 'true',
      DISABLE_INTEGRATIONS: 'true',
      NODE_ENV: 'test'
    }
  });

  child.stdout.on('data', d => console.log('[CHILD STDOUT]', d.toString()));
  child.stderr.on('data', d => console.error('[CHILD STDERR]', d.toString()));

  t.after(async () => {
    if (child.exitCode === null) {
      const exitDone = once(child, 'exit');
      child.kill();
      await exitDone.catch(() => {});
    }
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        break;
      } catch (_) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let online = false;
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) { online = true; break; }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(online, 'Servidor deve inicializar e responder /health');

  const basicAuth = (user, pass) => 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
  const authAdmin = basicAuth('admin_exec', 'SenhaAdminExec#2026');
  const authSemPermissao = basicAuth('user_restrito', 'SenhaUserRestrito#2026');

  await t.test('6. RBAC nas rotas /api/operacao/* (401 sem auth, 403 sem permissão, 200 admin)', async () => {
    // 6.1 /api/operacao/gestao-360
    const res360Anon = await fetch(`${baseUrl}/api/operacao/gestao-360`, {
      headers: { 'x-tenant-id': 'tenant_exec_test' }
    });
    assert.equal(res360Anon.status, 401);

    const res360NoPerm = await fetch(`${baseUrl}/api/operacao/gestao-360`, {
      headers: { Authorization: authSemPermissao, 'x-tenant-id': 'tenant_exec_test' }
    });
    assert.equal(res360NoPerm.status, 403);

    const res360Admin = await fetch(`${baseUrl}/api/operacao/gestao-360`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_exec_test' }
    });
    assert.equal(res360Admin.status, 200);
    const data360 = await res360Admin.json();
    assert.equal(data360.sucesso, true);
    assert.ok(data360.diagnosticoEstruturado);
    assert.ok(data360.textoWhatsApp);

    // 6.2 /api/operacao/compras-sugeridas
    const resComprasAdmin = await fetch(`${baseUrl}/api/operacao/compras-sugeridas`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_exec_test' }
    });
    assert.equal(resComprasAdmin.status, 200);
    const dataCompras = await resComprasAdmin.json();
    assert.equal(dataCompras.sucesso, true);
    assert.ok(dataCompras.resumo);
    assert.ok(dataCompras.financeiro);

    // 6.3 /api/operacao/produtividade-equipe
    const resProdAdmin = await fetch(`${baseUrl}/api/operacao/produtividade-equipe`, {
      headers: { Authorization: authAdmin, 'x-tenant-id': 'tenant_exec_test' }
    });
    assert.equal(resProdAdmin.status, 200);
    const dataProd = await resProdAdmin.json();
    assert.equal(dataProd.sucesso, true);
    assert.ok(dataProd.resumo);
    assert.ok(Array.isArray(dataProd.equipe));
  });

  // ─────────────────────────────────────────────────────────────────
  // 7. TESTES DOS COMANDOS WHATSAPP (!gestao360, !compras, !equipe)
  // ─────────────────────────────────────────────────────────────────

  await t.test('7. Comandos Administrativos no WhatsApp (!gestao360, !compras, !equipe)', async () => {
    const { processarMensagemTexto } = require('../services/whatsapp/whatsappHandlers');

    const stateWpp = {
      tenantId: 'tenant_wpp_test',
      pecas: [{ id: 'pw1', nome: 'Amortecedor', qtd: 0, min: 2, custo: 250 }],
      workers: [{ id: 'ww1', nome: 'José', jornadaHorasDia: 8, ativo: true }],
      laborEntries: [{ id: 'le1', workerId: 'ww1', osId: 'os1', durationMinutes: 240, type: 'produtivo' }],
      os: [{ id: 'os1', num: 1, st: 'executando', servicos: [{ mecanicoId: 'ww1', valor: 500 }] }],
      boxes: [{ id: 'b1', nome: 'Box 01' }],
      caixas: [{ id: 'cx1', status: 'aberto', saldoAtual: 3000 }],
      cfg: {
        grupoAdminId: 'grupo_admin_123@g.us',
        grupoOperacaoId: 'grupo_op_123@g.us',
        adminFones: ['5511999999999']
      }
    };

    // A. Bloqueio no grupo de operação
    const respostasOp = [];
    const mockMsgOp = {
      from: 'grupo_op_123@g.us',
      author: '5511988888888@c.us',
      body: '!gestao360',
      reply: async (txt) => respostasOp.push(txt)
    };
    await processarMensagemTexto(mockMsgOp, {
      tenantKey: 'tenant_wpp_test',
      tenantState: stateWpp,
      isContextOperacao: true,
      isContextAdmin: false
    });
    assert.equal(respostasOp.length, 1);
    assert.ok(respostasOp[0].includes('Acesso Restrito'));

    // B. !gestao360 no grupo admin
    const respostasAdmin360 = [];
    const mockMsgAdmin360 = {
      from: 'grupo_admin_123@g.us',
      author: '5511999999999@c.us',
      body: '!gestao360',
      reply: async (txt) => respostasAdmin360.push(txt)
    };
    await processarMensagemTexto(mockMsgAdmin360, {
      tenantKey: 'tenant_wpp_test',
      tenantState: stateWpp,
      isContextOperacao: false,
      isContextAdmin: true
    });
    assert.equal(respostasAdmin360.length, 1);
    assert.ok(respostasAdmin360[0].includes('RELATÓRIO GERENCIAL 360º'));

    // C. !compras no grupo admin
    const respostasAdminCompras = [];
    const mockMsgAdminCompras = {
      from: 'grupo_admin_123@g.us',
      author: '5511999999999@c.us',
      body: '!compras',
      reply: async (txt) => respostasAdminCompras.push(txt)
    };
    await processarMensagemTexto(mockMsgAdminCompras, {
      tenantKey: 'tenant_wpp_test',
      tenantState: stateWpp,
      isContextOperacao: false,
      isContextAdmin: true
    });
    assert.equal(respostasAdminCompras.length, 1);
    assert.ok(respostasAdminCompras[0].includes('SUGESTÃO DE COMPRAS & ESTOQUE CRÍTICO'));

    // D. !equipe no grupo admin
    const respostasAdminEquipe = [];
    const mockMsgAdminEquipe = {
      from: 'grupo_admin_123@g.us',
      author: '5511999999999@c.us',
      body: '!equipe',
      reply: async (txt) => respostasAdminEquipe.push(txt)
    };
    await processarMensagemTexto(mockMsgAdminEquipe, {
      tenantKey: 'tenant_wpp_test',
      tenantState: stateWpp,
      isContextOperacao: false,
      isContextAdmin: true
    });
    assert.equal(respostasAdminEquipe.length, 1);
    assert.ok(respostasAdminEquipe[0].includes('PRODUTIVIDADE DA EQUIPE & BOXES'));
  });

});

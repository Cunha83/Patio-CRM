'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

const { IdentityRegistry } = require('../lib/auth/identity');
const { createAuthMiddleware } = require('../lib/auth/context');
const { isValidTenantId, storageKey, getState, persistState, clearMemoryCache } = require('../lib/repository/stateRepository');
const { gerarTokenAcao, consumirTokenAcao } = require('../lib/tokens/securityToken');
const { migrarBancoLegado } = require('../lib/repository/migration');
const { initOutboxTable, agendarJob, processarProximoJob } = require('../lib/outbox/scheduler');
const { ImageRenderCache } = require('../lib/image-cache');
const financialEngine = require('../services/financialEngine');

/* ── 1. TESTE: REJEIÇÃO DE CREDENCIAIS PADRÃO & ENTROPIA ────── */
test('1. Segurança de Autenticação: rejeita credenciais padrão, senhas fracas e exige provisionamento seguro', () => {
  const strictReg = new IdentityRegistry({ allowWeakInTest: false });

  // 1.1 Tentar registrar com senhas/chaves padrão
  for (const bad of ['patio', 'patio-api-secret-2026', '123456', 'secret', 'sua_chave_aqui', 'curta']) {
    assert.throws(() => {
      strictReg.registerApiKey({ key: bad, tenantId: 'oficina_a' });
    }, /rejeitada: credencial fraca/);

    assert.throws(() => {
      strictReg.registerUser({ username: 'admin', password: bad, memberships: [] });
    }, /rejeitada: credencial fraca/);
  }

  // 1.2 Registrar chave segura
  strictReg.registerApiKey({
    key: 'chave-super-segura-tenant-a-123456',
    tenantId: 'oficina_a',
    name: 'Integrador Alfa',
    scopes: ['os:read', 'os:write']
  });

  // 1.3 Teste de autenticação
  const authRes = strictReg.authenticate({
    headers: { 'x-api-key': 'chave-super-segura-tenant-a-123456' }
  });
  assert.ok(authRes, 'Chave segura deve autenticar com sucesso');
  assert.equal(authRes.tenantId, 'oficina_a');
  assert.deepEqual(authRes.scopes, ['os:read', 'os:write']);

  // 1.4 Tentativa com chave errada
  assert.equal(strictReg.authenticate({ headers: { 'x-api-key': 'chave-inexistente-123456' } }), null);
});

/* ── 2. TESTE: VALIDAÇÃO DE TENANT ID & SEPARAÇÃO DE CHAVES ─── */
test('2. Repositório: Valida TenantId sem remover caracteres e impede colisão a.b vs ab', () => {
  // 2.1 Identificadores válidos
  assert.equal(isValidTenantId('oficina_matriz'), true);
  assert.equal(isValidTenantId('oficina-123'), true);
  assert.equal(isValidTenantId('auto_molas_fort'), true);

  // 2.2 Identificadores que NÃO podem colidir ou que são inválidos
  assert.equal(isValidTenantId('a.b'), false, 'Pontos não são permitidos em slugs de tenant');
  assert.equal(isValidTenantId('abc'), true);
  assert.equal(isValidTenantId(''), false);
  assert.equal(isValidTenantId('st'), false, 'Tamanho mínimo 3');
  assert.equal(isValidTenantId('state:oficina'), false, 'Prefixos arbitrários não são permitidos');

  // 2.3 Conversão para chave de persistência interna
  assert.equal(storageKey('oficina_matriz'), 'tenant:oficina_matriz:state');
  assert.throws(() => storageKey('a.b'), /TenantId inválido/);
  assert.throws(() => storageKey('state:oficina'), /TenantId inválido/);
});

/* ── 3. TESTE: ISOLAMENTO ESTREITO ENTRE IDENTIDADES A E B ──── */
test('3. Middleware de Contexto: Identidade A é impedida de acessar Tenant B via x-tenant-id forjado', () => {
  const reg = new IdentityRegistry({ allowWeakInTest: true });

  // API Key do Tenant A
  reg.registerApiKey({ key: 'key-tenant-a', tenantId: 'tenant_a', scopes: ['os:read'] });

  // Usuário membro apenas do Tenant B
  reg.registerUser({
    username: 'user_b',
    password: 'password-user-b',
    memberships: [{ tenantId: 'tenant_b', role: 'operador', permissions: ['os:read'] }]
  });

  const middleware = createAuthMiddleware(reg);

  const mockRes = () => ({
    code: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }
  });

  // 3.1 Identidade A tentando acessar Tenant A (Legítimo)
  let allowed = false;
  const reqA_A = { headers: { 'x-api-key': 'key-tenant-a', 'x-tenant-id': 'tenant_a' }, method: 'GET' };
  middleware(reqA_A, mockRes(), () => { allowed = true; });
  assert.equal(allowed, true);
  assert.equal(reqA_A.securityContext.tenantId, 'tenant_a');

  // 3.2 Identidade A forjando acesso ao Tenant B (Ataque Cross-Tenant)
  allowed = false;
  const resA_B = mockRes();
  const reqA_B = { headers: { 'x-api-key': 'key-tenant-a', 'x-tenant-id': 'tenant_b' }, method: 'GET' };
  middleware(reqA_B, resA_B, () => { allowed = true; });
  assert.equal(allowed, false, 'Identidade A NÃO pode acessar Tenant B');
  assert.equal(resA_B.code, 403);
  assert.match(resA_B.body.error, /Acesso negado/);

  // 3.3 Usuário B tentando acessar Tenant A
  allowed = false;
  const resB_A = mockRes();
  const basicB = 'Basic ' + Buffer.from('user_b:password-user-b').toString('base64');
  const reqB_A = { headers: { authorization: basicB, 'x-tenant-id': 'tenant_a' }, method: 'GET' };
  middleware(reqB_A, resB_A, () => { allowed = true; });
  assert.equal(allowed, false);
  assert.equal(resB_A.code, 403);

  // 3.4 Tenant ausente sem default configurado
  allowed = false;
  const resSemTenant = mockRes();
  const reqSemTenant = { headers: { authorization: basicB }, method: 'GET' };
  middleware(reqSemTenant, resSemTenant, () => { allowed = true; });
  assert.equal(allowed, false);
  assert.equal(resSemTenant.code, 403);
});

/* ── 4. TESTE: TOKENS CRIPTOGRÁFICOS DE AÇÃO, ATOR E REPLAY ─── */
test('4. Tokens Criptográficos: vinculam tenant, ator, recurso e impedem replay ou bypass via body', () => {
  const token = gerarTokenAcao({
    tenantId: 'oficina_alfa',
    actorId: 'operador_joao',
    resourceId: 'os_101',
    action: 'excluir_os',
    version: 5,
    ttlMs: 60 * 1000
  });

  // 4.1 Consumo legítimo
  const resOk = consumirTokenAcao(token, {
    tenantId: 'oficina_alfa',
    actorId: 'operador_joao',
    resourceId: 'os_101',
    action: 'excluir_os',
    version: 5
  });
  assert.equal(resOk.ok, true);
  assert.equal(resOk.payload.resourceId, 'os_101');

  // 4.2 Ataque de Replay: tentar consumir o mesmo token pela segunda vez
  const resReplay = consumirTokenAcao(token, {
    tenantId: 'oficina_alfa',
    actorId: 'operador_joao',
    resourceId: 'os_101',
    action: 'excluir_os',
    version: 5
  });
  assert.equal(resReplay.ok, false);
  assert.match(resReplay.error, /já utilizado/);

  // 4.3 Violação de Tenant: token da oficina Alfa usado na oficina Beta
  const tokenBeta = gerarTokenAcao({
    tenantId: 'oficina_alfa',
    actorId: 'operador_joao',
    resourceId: 'os_101',
    action: 'excluir_os',
    version: 5
  });
  const resDiffTenant = consumirTokenAcao(tokenBeta, {
    tenantId: 'oficina_beta', // Divergente!
    actorId: 'operador_joao',
    resourceId: 'os_101',
    action: 'excluir_os',
    version: 5
  });
  assert.equal(resDiffTenant.ok, false);
  assert.match(resDiffTenant.error, /outro tenant/);

  // 4.4 Divergência de Recurso (URL osId diferente do token)
  const tokenOS = gerarTokenAcao({
    tenantId: 'oficina_alfa',
    actorId: 'operador_joao',
    resourceId: 'os_101',
    action: 'excluir_os',
    version: 5
  });
  const resDiffOS = consumirTokenAcao(tokenOS, {
    tenantId: 'oficina_alfa',
    actorId: 'operador_joao',
    resourceId: 'os_999', // Divergente!
    action: 'excluir_os',
    version: 5
  });
  assert.equal(resDiffOS.ok, false);
  assert.match(resDiffOS.error, /recurso informado/);
});

/* ── 5. TESTE: PROTEÇÃO DE CFG E AUDITORIA NO REPOSITÓRIO ────── */
test('5. Repositório: Operador comum não pode sobrescrever cfg nem apagar auditoria', async () => {
  const { initDB } = require('../db');
  await initDB();
  clearMemoryCache();

  const enqueueWrite = fn => fn();

  // 5.1 Admin inicializa estado com cfg confidencial
  const tenantId = 'oficina_cfg_' + Date.now();
  const ctxAdmin = {
    tenantId,
    actorId: 'admin_master',
    permissions: ['admin:settings', '*']
  };

  const estadoInicial = {
    os: [],
    cfg: { grupoAdminId: '120363427960035119@g.us', faturamentoToken: 'segredo_empresa_123' },
    auditoria: [{ id: 'aud_1', resumo: 'Criação do sistema' }],
    versao: 0
  };

  const resAdmin = await persistState(ctxAdmin, estadoInicial, { enqueueWrite });
  assert.equal(resAdmin.ok, true);

  // 5.2 Operador tenta sobrescrever cfg e apagar auditoria via POST de estado
  const ctxOperador = {
    tenantId,
    actorId: 'operador_comum',
    permissions: ['os:read', 'os:write'] // SEM admin:settings
  };

  const tentativaOperador = {
    os: [{ id: 'os_nova', st: 'fila' }],
    cfg: { grupoAdminId: 'grupo_hacker@g.us', faturamentoToken: 'hackeado' }, // TENTATIVA DE INVASÃO
    auditoria: [], // TENTATIVA DE APAGAR RASTROS
    versao: resAdmin.versao
  };

  const resOp = await persistState(ctxOperador, tentativaOperador, { enqueueWrite });
  assert.equal(resOp.ok, true);

  // 5.3 Verifica que cfg foi mantido inalterado e auditoria foi preservada
  const stateSalvo = await getState(tenantId);
  assert.equal(stateSalvo.os.length, 1);
  assert.equal(stateSalvo.cfg.grupoAdminId, '120363427960035119@g.us', 'cfg NÃO deve ter sido alterado pelo operador');
  assert.equal(stateSalvo.cfg.faturamentoToken, 'segredo_empresa_123');
  assert.equal(stateSalvo.auditoria.length, 1, 'Auditoria deve permanecer intacta');
});

/* ── 6. TESTE: MIGRAÇÃO IDEMPOTENTE & DRY-RUN EM BANCO SINTÉTICO */
test('6. Migração: Dry-run analisa chaves legadas state e state:state em banco sintético sem alterar produção', async () => {
  const tempDbPath = path.join(os.tmpdir(), `test_synth_mig_${Date.now()}.db`);
  const synthDb = new sqlite3.Database(tempDbPath);

  await new Promise((resolve, reject) => {
    synthDb.serialize(() => {
      synthDb.run('CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT)');
      synthDb.run('INSERT INTO kv VALUES (?, ?)', ['state', JSON.stringify({ versao: 1, empresa: 'Matriz' })]);
      synthDb.run('INSERT INTO kv VALUES (?, ?)', ['state:filial_sul', JSON.stringify({ versao: 2, empresa: 'Sul' })]);
      synthDb.run('INSERT INTO kv VALUES (?, ?)', ['state:state_corrompido', JSON.stringify({ versao: 3 })], () => resolve());
    });
  });

  // 6.1 Dry-Run (Apenas planeja, sem executar)
  const relatorioDry = await migrarBancoLegado({ db: synthDb, dryRun: true });
  assert.equal(relatorioDry.dryRun, true);
  assert.equal(relatorioDry.totalChavesAnalisadas, 3);
  assert.ok(relatorioDry.migracoesPlanejadas.some(m => m.origem === 'state' && m.destino === 'tenant:default:state'));
  assert.ok(relatorioDry.migracoesPlanejadas.some(m => m.origem === 'state:filial_sul' && m.destino === 'tenant:filial_sul:state'));
  assert.ok(relatorioDry.ambiguidades.some(a => a.chave === 'state:state_corrompido'));

  // Confirma que nenhuma chave foi alterada no dry-run
  const keysPosDry = await new Promise(r => synthDb.all('SELECT key FROM kv', [], (err, rows) => r(rows.map(x => x.key))));
  assert.ok(keysPosDry.includes('state'));
  assert.ok(keysPosDry.includes('state:filial_sul'));

  synthDb.close();
  try { fs.unlinkSync(tempDbPath); } catch (_) {}
});

/* ── 7. TESTE: REGRA DE AMANHECIDOS E OCUPAÇÃO REAL DE BOXES ── */
test('7. Motor Financeiro & Pátio: Zero amanhecidos com veículos entrados hoje reporta boxes ocupados com precisão', () => {
  const ref = '2026-09-10';

  // Cenário: 2 caminhões entraram HOJE (2026-09-10) e ocupam 2 dos 4 boxes. Zero amanheceram.
  const stateOcupadoHoje = {
    cfg: { empresa: 'Oficina Pátio Teste' },
    os: [
      { id: 'os-1', vei: 'v-1', cli: 'c-1', st: 'executando', box: 'b1', abertura: '2026-09-10' },
      { id: 'os-2', vei: 'v-2', cli: 'c-2', st: 'executando', box: 'b2', abertura: '2026-09-10' }
    ],
    veiculos: [
      { id: 'v-1', placa: 'ENT1111', modelo: 'FH 540' },
      { id: 'v-2', placa: 'ENT2222', modelo: 'Actros' }
    ],
    clientes: [{ id: 'c-1', nome: 'Cliente 1' }, { id: 'c-2', nome: 'Cliente 2' }],
    boxes: [
      { id: 'b1', nome: 'Box 01' }, { id: 'b2', nome: 'Box 02' },
      { id: 'b3', nome: 'Box 03' }, { id: 'b4', nome: 'Box 04' }
    ]
  };

  const op = financialEngine.calcularResumoOperacional(stateOcupadoHoje, { dataRef: ref });
  assert.equal(op.totalAmanhecidos, 0, 'Zero veículos amanheceram');
  assert.equal(op.boxesOcupados, 2, '2 boxes estão ocupados por entradas de hoje');
  assert.equal(op.percOcupacao, 50, 'Taxa de ocupação real de 50%');

  const msgsAdmin = financialEngine.gerarMensagensAdmin(stateOcupadoHoje, { dataRef: ref });
  const msgsOp = financialEngine.gerarMensagensOperacao(stateOcupadoHoje, { dataRef: ref });

  // A mensagem NÃO pode alegar falsamente "Oficina 100% livre" ou "Todos os boxes livres"
  assert.doesNotMatch(msgsAdmin[2], /Oficina 100% livre!/);
  assert.doesNotMatch(msgsOp[1], /Todos os boxes livres/);

  // E deve expressar com clareza a ocupação real
  assert.match(msgsAdmin[2], /Nenhum veículo amanheceu no pátio/);
  assert.match(msgsOp[1], /Nenhum veículo amanheceu no pátio/);
});

/* ── 8. TESTE: OUTBOX SCHEDULER COM ADAPTADOR DETERMINÍSTICO ─── */
test('8. Outbox Scheduler: Unicidade por tenant/data/tipo e persistência atômica com adaptador simulado', async () => {
  const { initDB } = require('../db');
  await initDB();
  await initOutboxTable();

  // 8.1 Agendamento idempotente (mesmo job não duplica)
  const tenantId = 'outbox_alfa_' + Date.now();
  const j1 = await agendarJob({
    tenantId,
    dataRef: '2026-09-10',
    tipo: 'admin',
    destino: '120363427960035119@g.us'
  });
  assert.equal(j1.ok, true);

  const j2 = await agendarJob({
    tenantId,
    dataRef: '2026-09-10',
    tipo: 'admin',
    destino: '120363427960035119@g.us'
  });
  assert.equal(j2.ok, true);
  assert.equal(j2.duplicate, true, 'Não deve criar linha duplicada para o mesmo dia e destino');

  // 8.2 Adaptador falso determinístico simulando envio bem-sucedido
  const fakeAdapter = {
    async enviar(params) {
      return {
        success: true,
        messageId: `true_${params.destino}_3EB0FAKEMSGID123`
      };
    }
  };

  const processado = await processarProximoJob(fakeAdapter);
  assert.equal(processado.ok, true);
  assert.equal(processado.status, 'completed');
  assert.match(processado.messageId, /3EB0FAKEMSGID123/);
});

/* ── 9. TESTE: CACHE DE IMAGEM COM EVICÇÃO LRU ──────────────── */
test('9. Cache de Imagem JPG: Chave composta por tenant/versão e evicção com limite de memória', () => {
  const cache = new ImageRenderCache({ maxEntries: 2 });
  const buf1 = Buffer.from('img1');
  const buf2 = Buffer.from('img2');
  const buf3 = Buffer.from('img3');

  cache.set('tenantA', 1, '2026-09-10', {}, buf1);
  cache.set('tenantB', 1, '2026-09-10', {}, buf2);

  assert.equal(cache.get('tenantA', 1, '2026-09-10', {}), buf1);

  // Inserção do 3º item deve remover tenantB (menos recentemente acessado, pois acessamos tenantA)
  cache.set('tenantC', 1, '2026-09-10', {}, buf3);

  assert.equal(cache.get('tenantA', 1, '2026-09-10', {}), buf1, 'tenantA deve continuar no cache');
  assert.equal(cache.get('tenantC', 1, '2026-09-10', {}), buf3, 'tenantC foi adicionado');
  assert.equal(cache.get('tenantB', 1, '2026-09-10', {}), null, 'tenantB deve ter sido descartado por LRU');
});

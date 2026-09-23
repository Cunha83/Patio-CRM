'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patio-lgpd-test-'));
const testDbPath = path.join(tempDir, 'test.db');
process.env.DB_PATH = testDbPath;
process.env.BACKUP_DIR = tempDir;

const { initDB, run, get, all, closeDB } = require('../db');
const lgpdService = require('../services/lgpdService');
const userRepository = require('../lib/auth/userRepository');

test('Bateria Completa de Exportação LGPD com Documentos Fiscais Reais e Validação HTTP', async (t) => {
  await initDB();

  const tenantA = 'oficina_lgpd_a_' + Date.now();
  const tenantB = 'oficina_lgpd_b_' + Date.now();

  const stateA = {
    tenantId: tenantA,
    clientes: [
      {
        id: 'cli_alvo',
        nome: 'Transportadora Alvo Silva',
        doc: '11.222.333/0001-81',
        fone: '62988887777',
        email: 'alvo@transportes.com.br'
      },
      {
        id: 'cli_vizinho',
        nome: 'Auto Mecânica Vizinha',
        doc: '44.555.666/0001-99',
        fone: '62977776666'
      },
      {
        id: 'cli_sem_doc',
        nome: 'Motorista Avulso Sem Documento',
        doc: '',
        fone: '62999990000'
      }
    ],
    veiculos: [
      { id: 'vei_alvo', cli: 'cli_alvo', placa: 'ALV1A01', modelo: 'Scania R450' }
    ],
    os: [
      { id: 'os_alvo_101', cli: 'cli_alvo', num: 101, total: 4500.00, st: 'finalizada' }
    ],
    quotations: [],
    appointments: [],
    afterSales: []
  };

  // Salva o estado no kv table para o tenantA
  await run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [
    `tenant:${tenantA}:state`,
    JSON.stringify(stateA)
  ]);

  // Cria usuário para autenticação nos testes HTTP
  const testUser = 'user_lgpd@teste.com';
  const testPass = 'SenhaSegura#2026';
  await userRepository.createUser({
    username: testUser,
    password: testPass,
    role: 'attendant',
    tenantId: tenantA,
    memberships: [
      {
        tenantId: tenantA,
        role: 'attendant',
        permissions: ['crm:read', 'crm:write']
      }
    ],
    allowWeakInTest: false
  });

  const docBase = {
    tipo_operacao: 'saida',
    ambiente: 'homologacao',
    itens_json: '[]',
    impostos_json: '[]',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // 1. Doc fiscal do titular alvo por OS (válido e completo)
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_alvo_os', tenantA, '55', 'saida', '1', 1001, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_alvo_os', JSON.stringify({ documento: '11222333000181', nome: 'Transportadora Alvo Silva' }),
    '[]', JSON.stringify({ valorTotalDocumento: 4500.00, valorProdutos: 4500.00 }), '[]',
    '35260911222333000181550010000010011000000018', new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 2. Doc fiscal do titular alvo por documento sem formatação no destinatario_json
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_alvo_doc_sem_formato', tenantA, 'NFS-e', 'saida', '1', 2001, 'homologacao', 'autorizado', 'avulsa', null,
    'idem_alvo_sem_formato', JSON.stringify({ cnpj: '11222333000181', razao_social: 'Transportadora Alvo Silva' }),
    '[]', JSON.stringify({ valorTotal: 1200.00, valorServicos: 1200.00 }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 3. Doc fiscal do titular alvo com documento formatado no destinatario_json
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_alvo_doc_formatado', tenantA, '55', 'saida', '1', 1002, 'homologacao', 'autorizado', 'avulsa', null,
    'idem_alvo_formatado', JSON.stringify({ documento: '11.222.333/0001-81', nome: 'Transportadora Alvo' }),
    '[]', JSON.stringify({ valorTotalDocumento: 800.00 }), '[]',
    '35260911222333000181550010000010021000000025', new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 4. Doc de OUTRO titular da MESMA oficina (vizinho) -> NÃO pode ser incluído no alvo!
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_vizinho_mesma_oficina', tenantA, '55', 'saida', '1', 1003, 'homologacao', 'autorizado', 'avulsa', null,
    'idem_vizinho', JSON.stringify({ documento: '44555666000199', nome: 'Auto Mecânica Vizinha' }),
    '[]', JSON.stringify({ valorTotalDocumento: 300.00 }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 5. Doc de OUTRA OFICINA (tenantB) -> NÃO pode ser incluído (Tenant Isolation!)
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_outra_oficina_vazamento', tenantB, '55', 'saida', '1', 9999, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_outra_oficina', JSON.stringify({ documento: '11222333000181' }),
    '[]', JSON.stringify({ valorTotalDocumento: 99999.00 }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 6. Doc com origem_tipo diferente de 'os' (ex: 'orcamento') -> NÃO pode entrar por OS
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_origem_tipo_invalida', tenantA, '55', 'saida', '1', 1004, 'homologacao', 'rascunho', 'orcamento', 'os_alvo_101',
    'idem_tipo_divergente', JSON.stringify({ documento: '99988877700' }),
    '[]', '{}', '[]', null, null, docBase.created_at, docBase.updated_at
  ]);

  // 7. Doc com destinatario_json corrompido sem vínculo com OS -> NÃO deve ser incluído no titular
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_json_corrompido_avulso', tenantA, '55', 'saida', '1', 1005, 'homologacao', 'rejeitado', 'avulsa', null,
    'idem_json_quebrado', '{destinatario_invalido: missing_quotes',
    '[]', '{}', '[]', null, null, docBase.created_at, docBase.updated_at
  ]);

  // 8. Doc vinculado à OS do titular com destinatario_json corrompido (JSON inválido) -> Deve incluir mas marcar incompleto
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_destinatario_corrompido_os', tenantA, '55', 'saida', '1', 1006, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_dest_corrompido', '{destinatario: syntax_error',
    '[]', JSON.stringify({ valorTotal: 600.00 }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 9. Doc vinculado à OS do titular com destinatario_json válido mas de estrutura incorreta (sem CPF/CNPJ) -> incompleto
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_destinatario_sem_doc_os', tenantA, '55', 'saida', '1', 1007, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_dest_sem_doc', JSON.stringify({ razaoSocial: 'Apenas Razao Social Sem Doc' }),
    '[]', JSON.stringify({ valorTotal: 700.00 }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 10. Doc vinculado à OS do titular com totais_json corrompido (JSON inválido) -> totais: null (NÃO zeros!), incompleto: true
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_totais_corrompidos_os', tenantA, '55', 'saida', '1', 1008, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_totais_corrompidos', JSON.stringify({ documento: '11222333000181' }),
    '[]', '{totais_invalidos: missing_brace', '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 11. Doc vinculado à OS do titular com totais contendo valores inválidos (NaN/string não numérica) -> totais: null, incompleto: true
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_totais_nan_os', tenantA, '55', 'saida', '1', 1009, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_totais_nan', JSON.stringify({ documento: '11222333000181' }),
    '[]', JSON.stringify({ valorTotal: 'valor_invalido_texto', valorServicos: 100.00 }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 12. Doc vinculado à OS do titular com totais em JSON válido mas de estrutura incorreta (sem campo de total) -> totais: null, incompleto: true
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_totais_estrutura_incorreta_os', tenantA, '55', 'saida', '1', 1010, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_totais_estrutura_incorreta', JSON.stringify({ documento: '11222333000181' }),
    '[]', JSON.stringify({ chaveAleatoria: 12345, observacao: 'estrutura sem total' }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 13. Doc vinculado com totais como array ao invés de objeto -> totais: null, incompleto: true
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_totais_array_os', tenantA, '55', 'saida', '1', 1011, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_totais_array', JSON.stringify({ documento: '11222333000181' }),
    '[]', '[100, 200, 300]', '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 14. Doc com booleano no total (ex: { valorTotal: false, valorServicos: true }) -> REJEITADO, totais: null, incompleto: true
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_totais_booleano_os', tenantA, '55', 'saida', '1', 1012, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_totais_booleano', JSON.stringify({ documento: '11222333000181' }),
    '[]', JSON.stringify({ valorTotal: false, valorServicos: true }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 15. Doc com string vazia ou apenas espaços (ex: { valorTotal: "", valorServicos: "   " }) -> REJEITADO, totais: null, incompleto: true
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_totais_string_vazia_os', tenantA, '55', 'saida', '1', 1013, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_totais_vazio', JSON.stringify({ documento: '11222333000181' }),
    '[]', JSON.stringify({ valorTotal: "", valorServicos: "   " }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 16. Doc com array em campo numérico (ex: { valorTotal: [12], valorServicos: [] }) -> REJEITADO, totais: null, incompleto: true
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_totais_array_em_campo_os', tenantA, '55', 'saida', '1', 1014, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_totais_arr_campo', JSON.stringify({ documento: '11222333000181' }),
    '[]', JSON.stringify({ valorTotal: [12], valorServicos: [] }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 17. Doc com objeto em campo numérico (ex: { valorTotal: { v: 100 } }) -> REJEITADO, totais: null, incompleto: true
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_totais_objeto_em_campo_os', tenantA, '55', 'saida', '1', 1015, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_totais_obj_campo', JSON.stringify({ documento: '11222333000181' }),
    '[]', JSON.stringify({ valorTotal: { v: 100 } }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 18. Doc com strings numéricas válidas (ex: { valorTotal: "1550.50", valorServicos: "1550,50" }) -> VÁLIDO e convertido para número
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_totais_string_numerica_valida_os', tenantA, '55', 'saida', '1', 1016, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_totais_str_valida', JSON.stringify({ documento: '11222333000181' }),
    '[]', JSON.stringify({ valorTotal: "1550.50", valorServicos: "1550,50" }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  // 19. Doc com string numérica de formato inválido (ex: { valorTotal: "1500.50.99" }) -> REJEITADO, totais: null, incompleto: true
  await run(`INSERT INTO fiscal_documents (
    id, tenant_id, modelo, tipo_operacao, serie, numero, ambiente, status, origem_tipo, origem_id,
    idempotency_key, destinatario_json, itens_json, totais_json, impostos_json, chave_acesso,
    data_autorizacao, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    'fisc_totais_string_invalida_os', tenantA, '55', 'saida', '1', 1017, 'homologacao', 'autorizado', 'os', 'os_alvo_101',
    'idem_totais_str_invalida', JSON.stringify({ documento: '11222333000181' }),
    '[]', JSON.stringify({ valorTotal: "1500.50.99" }), '[]',
    null, new Date().toISOString(), docBase.created_at, docBase.updated_at
  ]);

  await t.test('1. Inclusão dos documentos pertinentes do titular e exclusão rigorosa dos demais', async () => {
    const res = await lgpdService.exportarDadosClienteAsync({
      tenantId: tenantA,
      state: stateA,
      customerId: 'cli_alvo'
    });

    assert.equal(res.ok, true);
    assert.equal(res.titular.nome, 'Transportadora Alvo Silva');

    const idsDocs = res.documentosFiscais.map(d => d.id);
    assert.ok(idsDocs.includes('fisc_alvo_os'), 'Deve incluir documento vinculado à OS do cliente');
    assert.ok(idsDocs.includes('fisc_alvo_doc_sem_formato'), 'Deve incluir documento com CNPJ sem formato');
    assert.ok(idsDocs.includes('fisc_alvo_doc_formatado'), 'Deve incluir documento com CNPJ formatado');

    assert.ok(!idsDocs.includes('fisc_vizinho_mesma_oficina'), 'NÃO pode incluir doc de outro cliente da mesma oficina');
    assert.ok(!idsDocs.includes('fisc_outra_oficina_vazamento'), 'NÃO pode incluir doc de outra oficina (Tenant Isolation)');
    assert.ok(!idsDocs.includes('fisc_origem_tipo_invalida'), 'NÃO pode incluir doc onde origem_tipo !== os');
    assert.ok(!idsDocs.includes('fisc_json_corrompido_avulso'), 'NÃO pode incluir doc avulso corrompido que não pertença comprovadamente');

    // Confere que a advertência e a flag de incompletude foram ativadas
    assert.equal(res.incompleto, true);
    assert.ok(res.advertencia && res.advertencia.includes('corrompida'));
  });

  await t.test('2. Tratamento estrito de destinatário inválido, totais corrompidos e estruturas incorretas', async () => {
    const res = await lgpdService.exportarDadosClienteAsync({
      tenantId: tenantA,
      state: stateA,
      customerId: 'cli_alvo'
    });

    assert.equal(res.ok, true);

    const docDestCorrompido = res.documentosFiscais.find(d => d.id === 'fisc_destinatario_corrompido_os');
    assert.ok(docDestCorrompido, 'Documento com destinatario corrompido mas vinculado à OS deve constar');
    assert.equal(docDestCorrompido.incompleto, true, 'Deve ser sinalizado como incompleto');

    const docDestSemDoc = res.documentosFiscais.find(d => d.id === 'fisc_destinatario_sem_doc_os');
    assert.ok(docDestSemDoc, 'Documento sem documento fiscal no destinatário mas vinculado à OS deve constar');
    assert.equal(docDestSemDoc.incompleto, true, 'Deve ser sinalizado como incompleto');

    const docTotaisCorrompidos = res.documentosFiscais.find(d => d.id === 'fisc_totais_corrompidos_os');
    assert.ok(docTotaisCorrompidos, 'Documento com totais corrompidos deve constar');
    assert.equal(docTotaisCorrompidos.totais, null, 'Totais corrompidos NUNCA devem virar zeros: deve ser estritamente null');
    assert.equal(docTotaisCorrompidos.incompleto, true, 'Deve ser sinalizado como incompleto');

    const docTotaisNan = res.documentosFiscais.find(d => d.id === 'fisc_totais_nan_os');
    assert.ok(docTotaisNan, 'Documento com valorTotal não numérico deve constar');
    assert.equal(docTotaisNan.totais, null, 'Totais com NaN NUNCA devem virar zeros: deve ser estritamente null');
    assert.equal(docTotaisNan.incompleto, true);

    const docTotaisEstruturaIncorreta = res.documentosFiscais.find(d => d.id === 'fisc_totais_estrutura_incorreta_os');
    assert.ok(docTotaisEstruturaIncorreta, 'Documento com estrutura de totais ausente deve constar');
    assert.equal(docTotaisEstruturaIncorreta.totais, null, 'Totais com estrutura incorreta NUNCA devem virar zeros');
    assert.equal(docTotaisEstruturaIncorreta.incompleto, true);

    const docTotaisArray = res.documentosFiscais.find(d => d.id === 'fisc_totais_array_os');
    assert.ok(docTotaisArray, 'Documento com array em totais_json deve constar');
    assert.equal(docTotaisArray.totais, null);
    assert.equal(docTotaisArray.incompleto, true);

    const docBooleano = res.documentosFiscais.find(d => d.id === 'fisc_totais_booleano_os');
    assert.ok(docBooleano, 'Documento com booleano nos totais deve constar');
    assert.equal(docBooleano.totais, null, 'Booleanos NUNCA devem virar zeros: deve ser null');
    assert.equal(docBooleano.incompleto, true);

    const docStrVazia = res.documentosFiscais.find(d => d.id === 'fisc_totais_string_vazia_os');
    assert.ok(docStrVazia, 'Documento com string vazia nos totais deve constar');
    assert.equal(docStrVazia.totais, null, 'Strings vazias NUNCA devem virar zeros: deve ser null');
    assert.equal(docStrVazia.incompleto, true);

    const docArrCampo = res.documentosFiscais.find(d => d.id === 'fisc_totais_array_em_campo_os');
    assert.ok(docArrCampo, 'Documento com array [12] em valorTotal deve constar');
    assert.equal(docArrCampo.totais, null, 'Arrays NUNCA devem ser coagidos para número: deve ser null');
    assert.equal(docArrCampo.incompleto, true);

    const docObjCampo = res.documentosFiscais.find(d => d.id === 'fisc_totais_objeto_em_campo_os');
    assert.ok(docObjCampo, 'Documento com objeto em valorTotal deve constar');
    assert.equal(docObjCampo.totais, null);
    assert.equal(docObjCampo.incompleto, true);

    const docStrInvalida = res.documentosFiscais.find(d => d.id === 'fisc_totais_string_invalida_os');
    assert.ok(docStrInvalida, 'Documento com string numérica inválida deve constar');
    assert.equal(docStrInvalida.totais, null);
    assert.equal(docStrInvalida.incompleto, true);

    const docStrValida = res.documentosFiscais.find(d => d.id === 'fisc_totais_string_numerica_valida_os');
    assert.ok(docStrValida, 'Documento com string numérica bem formatada deve ser admitido');
    assert.deepEqual(docStrValida.totais, {
      valorTotal: 1550.5,
      valorServicos: 1550.5,
      valorProdutos: null,
      desconto: null
    });
    assert.equal(docStrValida.incompleto, undefined);
  });

  await t.test('3. Cliente sem documento não vincula documentos fiscais indevidamente por valor vazio', async () => {
    const res = await lgpdService.exportarDadosClienteAsync({
      tenantId: tenantA,
      state: stateA,
      customerId: 'cli_sem_doc'
    });

    assert.equal(res.ok, true);
    assert.equal(res.documentosFiscais.length, 0, 'Cliente sem doc e sem OS não deve receber notas de terceiros');
  });

  await t.test('4. Falha de consulta no banco reporta erro explícito e flag incompleto sem sucesso falso', async () => {
    await run('ALTER TABLE fiscal_documents RENAME TO fiscal_documents_temporario_falha');

    try {
      const resFalha = await lgpdService.exportarDadosClienteAsync({
        tenantId: tenantA,
        state: stateA,
        customerId: 'cli_alvo'
      });

      assert.equal(resFalha.ok, false);
      assert.equal(resFalha.incompleto, true);
      assert.equal(resFalha.status, 500);
      assert.ok(resFalha.error.includes('Falha ao consultar documentos fiscais'));
      assert.equal(resFalha.documentosFiscais.length, 0);
    } finally {
      await run('ALTER TABLE fiscal_documents_temporario_falha RENAME TO fiscal_documents');
    }
  });

  await t.test('5. Retorno HTTP da rota GET /api/lgpd/clientes/:id/exportar com documentos reais no banco isolado', async () => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise(r => probe.close(r));

    const root = path.resolve(__dirname, '..');
    let childLogs = '';
    const child = spawn(process.execPath, ['server.js'], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        PORT: String(port),
        API_KEY: 'test-api-key',
        AUTH_USER: '',
        AUTH_PASSWORD: '',
        DISABLE_INTEGRATIONS: 'true',
        DB_PATH: testDbPath,
        BACKUP_DIR: tempDir
      }
    });

    child.stdout.on('data', d => { childLogs += d; });
    child.stderr.on('data', d => { childLogs += d; });

    try {
      for (let i = 0; i < 300; i++) {
        if (child.exitCode !== null) throw new Error('Servidor encerrou: ' + childLogs);
        try {
          const res = await fetch(`http://127.0.0.1:${port}/health`);
          if (res.status === 200) break;
        } catch (_) {}
        await new Promise(r => setTimeout(r, 50));
      }

      const authHeaders = {
        'Authorization': 'Basic ' + Buffer.from(`${testUser}:${testPass}`).toString('base64'),
        'x-tenant-id': tenantA
      };

      // Chamada HTTP para exportação de dados do titular
      const httpRes = await fetch(`http://127.0.0.1:${port}/api/lgpd/clientes/cli_alvo/exportar`, {
        method: 'GET',
        headers: authHeaders
      });

      assert.equal(httpRes.status, 200, 'Endpoint deve responder com HTTP 200');
      const body = await httpRes.json();

      assert.equal(body.ok, true);
      assert.equal(body.incompleto, true, 'Exportação deve conter a flag de incompletude no nível raiz');
      assert.ok(body.advertencia && body.advertencia.includes('corrompida'));
      assert.ok(Array.isArray(body.documentosFiscais));
      assert.ok(body.documentosFiscais.length >= 8);

      // Valida integridade e não-coerção para zero nos dados retornados via HTTP
      const docTotaisCorrompidos = body.documentosFiscais.find(d => d.id === 'fisc_totais_corrompidos_os');
      assert.ok(docTotaisCorrompidos);
      assert.equal(docTotaisCorrompidos.totais, null, 'HTTP response: totais corrompidos devem ser null, nunca { valorTotal: 0 }');
      assert.equal(docTotaisCorrompidos.incompleto, true);

      const docTotaisNan = body.documentosFiscais.find(d => d.id === 'fisc_totais_nan_os');
      assert.ok(docTotaisNan);
      assert.equal(docTotaisNan.totais, null, 'HTTP response: totais com NaN devem ser null, nunca zeros');
      assert.equal(docTotaisNan.incompleto, true);

      // Chamada HTTP para cliente inexistente deve retornar HTTP 404
      const httpResInexistente = await fetch(`http://127.0.0.1:${port}/api/lgpd/clientes/cli_nao_existe/exportar`, {
        method: 'GET',
        headers: authHeaders
      });
      assert.equal(httpResInexistente.status, 404);
      const bodyInexistente = await httpResInexistente.json();
      assert.equal(bodyInexistente.ok, false);

    } finally {
      if (child && child.exitCode === null) {
        const exitDone = once(child, 'exit');
        child.kill();
        await exitDone;
      }
    }
  });

  t.after(async () => {
    await closeDB();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  });
});


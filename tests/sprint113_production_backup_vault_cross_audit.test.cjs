'use strict';

/**
 * tests/sprint113_production_backup_vault_cross_audit.test.cjs
 *
 * Suíte de Testes TDD: Sprint 11.3 (Fechamento da Fase 11 - Release v2.1.0 Autonomous Enterprise)
 * - Cofre de Snapshot/Restore Atômico com Verificação Anti-Adulteração SHA-256
 * - Motor de Auditoria de Integridade Cruzada do ERP nos 4 Pilares & Auto-Reparo
 * - UI & Delegação de Eventos de Governança
 *
 * Teto Modular: <= 350 linhas
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  gerarSnapshotBackupCriptografado,
  validarERestaurarSnapshotBackup,
  executarAuditoriaIntegridadeCruzadaErp,
  listarHistoricoSnapshotsEAuditorias
} = require('../services/ops/productionBackupAuditService');

function criarEstadoMock() {
  return {
    tenantId: 'tenant_ops_enterprise',
    clientes: [
      { id: 'cli_transp_uniao', nome: 'Transp União Ltda', cnpj: '33.444.555/0001-66', limiteCredito: 50000 }
    ],
    os: [
      { id: 'os_ops_900', num: 900, placa: 'MOL1A23', clienteId: 'cli_transp_uniao', status: 'em_andamento', boxAtualId: 'box_01' }
    ],
    serviceOrders: [],
    estoque: [
      { id: 'peca_pino_01', codigo: 'PIN-01', descricao: 'Pino de Centro Forjado', qtd: 10, custoMedio: 120.00 }
    ],
    pecas: [],
    partReservations: [
      { id: 'res_01', osId: 'os_ops_900', partId: 'peca_pino_01', quantity: 2, status: 'ativa' }
    ],
    purchaseOrders: [
      { id: 'ped_01', status: 'recebido', fornecedorNome: 'Molas Brasil', valorTotalPedido: 2400.00 }
    ],
    patioBoxes: [
      { id: 'box_01', nome: 'Box 01 - Pesados', status: 'ocupado', osAtualId: 'os_ops_900' }
    ],
    boxes: [],
    patioBottlenecks: [],
    borderos: [
      { id: 'bor_100', num: 100, clienteId: 'cli_transp_uniao', status: 'aberto', totalLiquido: 5000.00 }
    ],
    borderosFrotistas: [],
    contas: [
      { id: 'cta_01', tipo: 'receber', valor: 5000.00, status: 'pendente' }
    ],
    paymentCharges: [
      { id: 'chg_01', txid: 'PIX_OPS_12345678', valorCobrar: 5000.00, status: 'pendente' }
    ],
    debtSettlementAgreements: [],
    dailyCashClosings: [],
    supplierQuotations: [],
    whatsappOutboundQueue: [],
    systemBackupSnapshots: [],
    crossIntegrityAuditLogs: []
  };
}

test('Sprint 11.3 — Snapshot: Geração Determinística e Hash Criptográfico SHA-256', () => {
  const state = criarEstadoMock();
  const snapshot = gerarSnapshotBackupCriptografado(state, {
    motivo: 'snapshot_pre_release_v2.1.0',
    responsavel: 'Engenheiro-DevOps'
  });

  assert.ok(snapshot.snapshotId);
  assert.equal(snapshot.motivo, 'snapshot_pre_release_v2.1.0');
  assert.equal(snapshot.responsavel, 'Engenheiro-DevOps');
  assert.ok(snapshot.totalRegistrosAuditados >= 7);
  assert.equal(typeof snapshot.checksumSha256, 'string');
  assert.equal(snapshot.checksumSha256.length, 64); // SHA-256 hexadecimal

  // Validação do hash sobre os dados serializados
  const hashEsperado = crypto.createHash('sha256').update(JSON.stringify(snapshot.payloadDados)).digest('hex');
  assert.equal(snapshot.checksumSha256, hashEsperado);

  // Registro gravado no estado
  assert.equal(state.systemBackupSnapshots.length, 1);
  assert.equal(state.systemBackupSnapshots[0].checksumSha256, snapshot.checksumSha256);
});

test('Sprint 11.3 — Restauração: Proteção Anti-Adulteração SHA-256 e Confirmação', () => {
  const state = criarEstadoMock();
  const snapshot = gerarSnapshotBackupCriptografado(state);

  // 1. Falha se tentar restaurar sem confirmarRestauracao = true
  assert.throws(() => {
    validarERestaurarSnapshotBackup(state, snapshot.snapshotId, { confirmarRestauracao: false });
  }, err => err.code === 'RESTORE_CONFIRMATION_REQUIRED' && err.status === 400);

  // 2. Adulteração do backup: Alguém altera 1 centavo no payloadDados do snapshot
  const snapshotAdulterado = JSON.parse(JSON.stringify(snapshot));
  snapshotAdulterado.payloadDados.estoque[0].custoMedio = 120.01; // adulteração!

  assert.throws(() => {
    validarERestaurarSnapshotBackup(state, snapshotAdulterado, { confirmarRestauracao: true });
  }, err => {
    return err.code === 'BACKUP_INTEGRITY_HASH_MISMATCH' && err.status === 422;
  });

  // 3. Snapshot não encontrado
  assert.throws(() => {
    validarERestaurarSnapshotBackup(state, 'snp_inexistente', { confirmarRestauracao: true });
  }, err => err.code === 'BACKUP_NOT_FOUND' && err.status === 404);
});

test('Sprint 11.3 — Restauração Atômica: Recuperação Íntegra Após Acidente de Dados', () => {
  const state = criarEstadoMock();
  const snapshotOriginal = gerarSnapshotBackupCriptografado(state);

  // Simula incidente operacional: deleção acidental de OS, clientes e estoque
  state.clientes = [];
  state.os = [];
  state.estoque = [];
  state.contas = [];
  assert.equal(state.clientes.length, 0);

  // Executa restauração atômica a partir do snapshot do cofre
  const res = validarERestaurarSnapshotBackup(state, snapshotOriginal.snapshotId, {
    confirmarRestauracao: true,
    responsavel: 'Coordenador-Producao'
  });

  assert.ok(res.restauradoComSucesso);
  assert.equal(res.checksumVerificado, snapshotOriginal.checksumSha256);
  assert.ok(res.totalRegistrosRestaurados >= 7);

  // Validação: dados recuperados com fidelidade absoluta
  assert.equal(state.clientes.length, 1);
  assert.equal(state.clientes[0].nome, 'Transp União Ltda');
  assert.equal(state.os.length, 1);
  assert.equal(state.os[0].placa, 'MOL1A23');
  assert.equal(state.estoque.length, 1);
  assert.equal(state.estoque[0].codigo, 'PIN-01');
  assert.equal(state.contas.length, 1);
});

test('Sprint 11.3 — Auditoria de Integridade Cruzada: Diagnóstico dos 4 Pilares & Auto-Reparo', () => {
  const state = criarEstadoMock();

  // Injetando anomalias propositais nos 4 pilares:
  // Pilar 1: Box bloqueado por gargalo sem nenhum gargalo aberto em patioBottlenecks
  state.patioBoxes.push({ id: 'box_orfao', nome: 'Box 02 - Órfão', status: 'bloqueado_gargalo', osAtualId: null });

  // Pilar 2: Cliente com acordo de dívida ativo mas borderô ainda vencido
  state.debtSettlementAgreements.push({ id: 'acordo_01', clienteId: 'cli_transp_uniao', status: 'ativo_em_dia' });
  state.borderos.push({ id: 'bor_vencido', clienteId: 'cli_transp_uniao', status: 'vencido', valor: 3500 });

  // Pilar 3: Peça com estoque físico negativo e CMP negativo
  state.estoque.push({ id: 'peca_errada', codigo: 'ERR-01', qtd: -4, custoMedio: -25.00 });

  // Pilar 4: Mensagem retida na Dead Letter Queue (DLQ)
  state.whatsappOutboundQueue.push({ id: 'msg_falha', status: 'dead_letter_falha_permanente' });

  // 1. Executa Auditoria SEM auto-reparo
  const laudoDiagnostico = executarAuditoriaIntegridadeCruzadaErp(state, { repararInconsistenciasLeves: false });
  assert.ok(laudoDiagnostico.laudoId);
  assert.equal(laudoDiagnostico.totalInconsistencias, 5); // box orfão, bordero, saldo negativo, cmp negativo, DLQ
  assert.ok(laudoDiagnostico.scoreIntegridadeErp < 50); // score degradado pelas inconsistências
  assert.equal(laudoDiagnostico.totalReparos, 0);

  // 2. Executa Auditoria COM auto-reparo de inconsistências leves
  const laudoReparado = executarAuditoriaIntegridadeCruzadaErp(state, { repararInconsistenciasLeves: true });
  assert.ok(laudoReparado.totalReparos >= 4);

  // Valida que o box órfão foi normalizado para 'livre'
  const boxOrfao = state.patioBoxes.find(b => b.id === 'box_orfao');
  assert.equal(boxOrfao.status, 'livre');

  // Valida que o borderô foi alterado para 'renegociado_acordo'
  const bor = state.borderos.find(b => b.id === 'bor_vencido');
  assert.equal(bor.status, 'renegociado_acordo');

  // Valida que a peça teve quantidade e CMP normalizados para zero
  const peca = state.estoque.find(p => p.id === 'peca_errada');
  assert.equal(peca.qtd, 0);
  assert.equal(peca.custoMedio, 0);

  // Score recuperado (única pendência restante é a DLQ que requer intervenção humana)
  assert.ok(laudoReparado.scoreIntegridadeErp >= 80);
});

test('Sprint 11.3 — Histórico de Snapshots e Auditorias', () => {
  const state = criarEstadoMock();
  gerarSnapshotBackupCriptografado(state, { motivo: 'historico_teste' });
  executarAuditoriaIntegridadeCruzadaErp(state, { repararInconsistenciasLeves: false });

  const historico = listarHistoricoSnapshotsEAuditorias(state);
  assert.equal(historico.snapshots.length, 1);
  assert.equal(historico.snapshots[0].motivo, 'historico_teste');
  assert.equal(historico.auditorias.length, 1);
});

test('Sprint 11.3 — Componentes de UI e Ações de Governança', () => {
  require('../js/modules/ops_backup_auditoria_ui');
  require('../js/modules/ops_backup_auditoria_actions');

  const html = globalThis.renderPainelBackupEAuditoriaIntegridadeHtml({
    snapshots: [
      { snapshotId: 'snp_test_1', criadoEm: new Date().toISOString(), motivo: 'manual', totalRegistrosAuditados: 120, checksumSha256: 'a1b2c3d4e5f6789012345678' }
    ],
    auditorias: [
      { laudoId: 'laudo_test_1', timestamp: new Date().toISOString(), scoreIntegridadeErp: 98, statusGeral: 'integro', totalInconsistencias: 0, totalReparos: 0 }
    ]
  });

  assert.match(html, /Cofre de Backup SHA-256 & Integridade Cruzada ERP/);
  assert.match(html, /data-act="abrir-modal-gerar-snapshot-btn"/);
  assert.match(html, /data-act="executar-auditoria-integridade-btn"/);
  assert.match(html, /data-act="executar-auditoria-com-reparo-btn"/);
  assert.match(html, /data-act="abrir-modal-restaurar-snapshot-btn"/);

  const modalGerar = globalThis.modalGerarSnapshotBackupHtml();
  assert.match(modalGerar, /Gerar Snapshot de Backup SHA-256/);
  assert.match(modalGerar, /data-act="confirmar-gerar-snapshot-action"/);

  const modalRestaurar = globalThis.modalRestaurarSnapshotBackupHtml({ snapshotId: 'snp_123', checksumSha256: 'abc987654321' });
  assert.match(modalRestaurar, /Restaurar Snapshot de Backup/);
  assert.match(modalRestaurar, /data-act="confirmar-restaurar-snapshot-action"/);

  assert.equal(typeof globalThis.abrirModalGerarSnapshot, 'function');
  assert.equal(typeof globalThis.confirmarGerarSnapshotAction, 'function');
  assert.equal(typeof globalThis.abrirModalRestaurarSnapshot, 'function');
  assert.equal(typeof globalThis.confirmarRestaurarSnapshotAction, 'function');
  assert.equal(typeof globalThis.executarAuditoriaIntegridadeAction, 'function');
  assert.equal(typeof globalThis.atualizarPainelBackupAuditoriaAction, 'function');
});


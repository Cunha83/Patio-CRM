'use strict';

/**
 * services/ops/productionBackupAuditService.js
 *
 * Cofre de Snapshot/Backup Atômico com Verificação SHA-256 e
 * Motor de Auditoria de Integridade Cruzada do ERP (Pátio, Estoque CMP, Crédito e Filas WhatsApp).
 *
 * Teto Modular: <= 265 linhas
 */

const crypto = require('crypto');
const gerarId = p => `${p}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

function garantirColecoesOps(state) {
  if (!state) throw new Error('Estado da aplicação não informado');
  state.systemBackupSnapshots = Array.isArray(state.systemBackupSnapshots) ? state.systemBackupSnapshots : [];
  state.crossIntegrityAuditLogs = Array.isArray(state.crossIntegrityAuditLogs) ? state.crossIntegrityAuditLogs : [];
}

function extrairColecoesNegocio(state) {
  const clone = obj => JSON.parse(JSON.stringify(obj || []));
  return {
    clientes: clone(state.clientes),
    os: clone(state.os?.length ? state.os : state.serviceOrders),
    estoque: clone(state.estoque?.length ? state.estoque : state.pecas),
    partReservations: clone(state.partReservations),
    purchaseOrders: clone(state.purchaseOrders),
    patioBoxes: clone(state.patioBoxes?.length ? state.patioBoxes : state.boxes),
    patioBottlenecks: clone(state.patioBottlenecks),
    borderos: clone(state.borderos),
    fleetBorderos: clone(state.borderosFrotistas?.length ? state.borderosFrotistas : state.fleetBorderos),
    contas: clone(state.contas),
    paymentCharges: clone(state.paymentCharges),
    debtSettlementAgreements: clone(state.debtSettlementAgreements),
    dailyCashClosings: clone(state.dailyCashClosings),
    supplierQuotations: clone(state.supplierQuotations)
  };
}

function gerarSnapshotBackupCriptografado(state, { motivo = 'backup_preventivo_producao', responsavel = 'Admin-Ops', incluirPayloadCompleto = true, timestamp } = {}) {
  garantirColecoesOps(state);
  const payloadDados = extrairColecoesNegocio(state);
  let totalRegistrosAuditados = 0;
  const resumoColecoes = {};
  for (const [k, v] of Object.entries(payloadDados)) {
    resumoColecoes[k] = v.length;
    totalRegistrosAuditados += v.length;
  }

  const serializado = JSON.stringify(payloadDados);
  const checksumSha256 = crypto.createHash('sha256').update(serializado).digest('hex');
  const snapshotId = gerarId('snp');
  const agora = timestamp || new Date().toISOString();

  const snapshotMeta = {
    id: snapshotId, snapshotId, criadoEm: agora, motivo, responsavel,
    totalRegistrosAuditados, resumoColecoes, checksumSha256,
    payloadDados: incluirPayloadCompleto ? payloadDados : null
  };

  state.systemBackupSnapshots.unshift(snapshotMeta);
  if (state.systemBackupSnapshots.length > 50) state.systemBackupSnapshots.pop();

  return { snapshotId, criadoEm: agora, motivo, responsavel, totalRegistrosAuditados, resumoColecoes, checksumSha256, payloadDados };
}

function validarERestaurarSnapshotBackup(state, snapshotInput, { confirmarRestauracao = false, responsavel = 'Admin-Ops', timestamp } = {}) {
  garantirColecoesOps(state);
  if (!confirmarRestauracao) {
    const err = new Error('Confirmação explícita obrigatória para restaurar snapshot de backup.');
    err.code = 'RESTORE_CONFIRMATION_REQUIRED';
    err.status = 400;
    throw err;
  }

  let snapshot = typeof snapshotInput === 'string'
    ? state.systemBackupSnapshots.find(s => s.id === snapshotInput || s.snapshotId === snapshotInput)
    : snapshotInput;

  if (!snapshot || !snapshot.payloadDados || !snapshot.checksumSha256) {
    const err = new Error('Snapshot de backup não encontrado ou dados corrompidos.');
    err.code = 'BACKUP_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  // Verificação estrita anti-adulteração SHA-256
  const serializado = JSON.stringify(snapshot.payloadDados);
  const hashRecalculado = crypto.createHash('sha256').update(serializado).digest('hex');
  if (hashRecalculado !== snapshot.checksumSha256) {
    const err = new Error('Falha de integridade SHA-256 no backup: dados foram adulterados ou corrompidos!');
    err.code = 'BACKUP_INTEGRITY_HASH_MISMATCH';
    err.status = 422;
    throw err;
  }

  // Restauração Atômica
  const d = snapshot.payloadDados;
  state.clientes = JSON.parse(JSON.stringify(d.clientes || []));
  state.os = JSON.parse(JSON.stringify(d.os || []));
  state.serviceOrders = state.os;
  state.estoque = JSON.parse(JSON.stringify(d.estoque || []));
  state.pecas = state.estoque;
  state.partReservations = JSON.parse(JSON.stringify(d.partReservations || []));
  state.purchaseOrders = JSON.parse(JSON.stringify(d.purchaseOrders || []));
  state.patioBoxes = JSON.parse(JSON.stringify(d.patioBoxes || []));
  state.boxes = state.patioBoxes;
  state.patioBottlenecks = JSON.parse(JSON.stringify(d.patioBottlenecks || []));
  state.borderos = JSON.parse(JSON.stringify(d.borderos || []));
  state.borderosFrotistas = JSON.parse(JSON.stringify(d.fleetBorderos || []));
  state.contas = JSON.parse(JSON.stringify(d.contas || []));
  state.paymentCharges = JSON.parse(JSON.stringify(d.paymentCharges || []));
  state.debtSettlementAgreements = JSON.parse(JSON.stringify(d.debtSettlementAgreements || []));
  state.dailyCashClosings = JSON.parse(JSON.stringify(d.dailyCashClosings || []));
  state.supplierQuotations = JSON.parse(JSON.stringify(d.supplierQuotations || []));

  let totalRestaurados = 0;
  for (const v of Object.values(d)) totalRestaurados += (v?.length || 0);

  return {
    restauradoComSucesso: true,
    snapshotId: snapshot.snapshotId || snapshot.id,
    checksumVerificado: snapshot.checksumSha256,
    totalRegistrosRestaurados: totalRestaurados,
    restauradoEm: timestamp || new Date().toISOString(),
    responsavel
  };
}

function executarAuditoriaIntegridadeCruzadaErp(state, { repararInconsistenciasLeves = false, responsavel = 'Auditor-Automatico', timestamp } = {}) {
  garantirColecoesOps(state);
  const inconsistenciasDetectadas = [];
  const reparosAplicados = [];

  // 1. Boxes vs. Gargalos
  const boxes = state.patioBoxes?.length ? state.patioBoxes : (state.boxes || []);
  const bottlenecks = state.patioBottlenecks || [];
  for (const box of boxes) {
    if (box.status === 'bloqueado_gargalo') {
      const gAberto = bottlenecks.some(g => (g.boxId === box.id || (box.osAtualId && g.osId === box.osAtualId)) && (g.status === 'aberto' || g.status === 'ativo'));
      if (!gAberto) {
        inconsistenciasDetectadas.push({ pilar: 'patioBoxesCheck', tipo: 'box_bloqueado_sem_gargalo_aberto', boxId: box.id, descricao: `Box ${box.id} bloqueado_gargalo sem gargalo correspondente.` });
        if (repararInconsistenciasLeves) {
          box.status = box.osAtualId ? 'ocupado' : 'livre';
          reparosAplicados.push({ pilar: 'patioBoxesCheck', boxId: box.id, acao: `Status normalizado para ${box.status}` });
        }
      }
    }
  }

  // 2. Crédito & Acordos por Cliente
  const acordos = state.debtSettlementAgreements || [];
  const borderos = [...(state.borderos || []), ...(state.borderosFrotistas || [])];
  for (const ac of acordos) {
    if (ac.status === 'ativo_em_dia' && ac.clienteId) {
      const bPendentes = borderos.filter(b => b.clienteId === ac.clienteId && (b.status === 'vencido' || b.status === 'pendente'));
      for (const b of bPendentes) {
        inconsistenciasDetectadas.push({ pilar: 'clientCreditCheck', tipo: 'bordero_acordo_ativo_sem_status_renegociado', clienteId: ac.clienteId, borderoId: b.id, descricao: `Borderô ${b.id} pendente com acordo ativo.` });
        if (repararInconsistenciasLeves) {
          b.status = 'renegociado_acordo';
          reparosAplicados.push({ pilar: 'clientCreditCheck', borderoId: b.id, acao: 'Status alterado para renegociado_acordo' });
        }
      }
    }
  }

  // 3. Estoque & CMP
  const pecas = state.estoque?.length ? state.estoque : (state.pecas || []);
  for (const p of pecas) {
    const qtd = Number(p.qtd ?? p.quantidade ?? 0);
    const cmp = Number(p.custoMedio ?? p.custo ?? 0);
    if (qtd < 0) {
      inconsistenciasDetectadas.push({ pilar: 'inventoryCmpCheck', tipo: 'saldo_estoque_negativo', pecaId: p.id, descricao: `Peça ${p.codigo || p.id} com quantidade negativa (${qtd}).` });
      if (repararInconsistenciasLeves) {
        p.qtd = 0; if (p.quantidade !== undefined) p.quantidade = 0;
        reparosAplicados.push({ pilar: 'inventoryCmpCheck', pecaId: p.id, acao: 'Saldo negativo ajustado para zero' });
      }
    }
    if (cmp < 0) {
      inconsistenciasDetectadas.push({ pilar: 'inventoryCmpCheck', tipo: 'custo_medio_negativo', pecaId: p.id, descricao: `Peça ${p.codigo || p.id} com CMP negativo (${cmp}).` });
      if (repararInconsistenciasLeves) {
        if (p.custoMedio < 0) p.custoMedio = 0; if (p.custo < 0) p.custo = 0;
        reparosAplicados.push({ pilar: 'inventoryCmpCheck', pecaId: p.id, acao: 'CMP negativo normalizado para zero' });
      }
    }
  }

  // 4. Filas WhatsApp
  const dlqItens = (state.whatsappOutboundQueue || []).filter(m => m.status === 'dead_letter_falha_permanente');
  if (dlqItens.length > 0) {
    inconsistenciasDetectadas.push({ pilar: 'whatsappQueueCheck', tipo: 'mensagens_retidas_dlq_whatsapp', total: dlqItens.length, descricao: `${dlqItens.length} msg(s) retida(s) na DLQ WhatsApp.` });
  }

  // Score de Integridade
  const penalidades = (inconsistenciasDetectadas.length - (repararInconsistenciasLeves ? reparosAplicados.length : 0)) * 15;
  const scoreIntegridadeErp = Math.max(0, 100 - penalidades);
  const statusGeral = scoreIntegridadeErp >= 90 ? 'integro' : (scoreIntegridadeErp >= 60 ? 'atencao' : 'critico');
  const agora = timestamp || new Date().toISOString();

  const laudo = {
    laudoId: gerarId('laudo_aud'), timestamp: agora, responsavel,
    repararInconsistenciasLeves: !!repararInconsistenciasLeves, scoreIntegridadeErp, statusGeral,
    totalInconsistencias: inconsistenciasDetectadas.length, totalReparos: reparosAplicados.length,
    inconsistenciasDetectadas, reparosAplicados,
    pilaresAuditados: ['patioBoxesCheck', 'clientCreditCheck', 'inventoryCmpCheck', 'whatsappQueueCheck'],
    checksumSha256: crypto.createHash('sha256').update(JSON.stringify({ scoreIntegridadeErp, inconsistenciasDetectadas, agora })).digest('hex')
  };

  state.crossIntegrityAuditLogs.unshift(laudo);
  if (state.crossIntegrityAuditLogs.length > 50) state.crossIntegrityAuditLogs.pop();
  return laudo;
}

function listarHistoricoSnapshotsEAuditorias(state) {
  garantirColecoesOps(state);
  return {
    snapshots: state.systemBackupSnapshots.map(s => ({
      snapshotId: s.snapshotId || s.id, criadoEm: s.criadoEm, motivo: s.motivo, responsavel: s.responsavel,
      totalRegistrosAuditados: s.totalRegistrosAuditados, resumoColecoes: s.resumoColecoes, checksumSha256: s.checksumSha256
    })),
    auditorias: state.crossIntegrityAuditLogs
  };
}

module.exports = {
  gerarSnapshotBackupCriptografado,
  validarERestaurarSnapshotBackup,
  executarAuditoriaIntegridadeCruzadaErp,
  listarHistoricoSnapshotsEAuditorias
};

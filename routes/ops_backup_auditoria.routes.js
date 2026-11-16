'use strict';

/**
 * routes/ops_backup_auditoria.routes.js
 *
 * Endpoints REST:
 * 1. POST /api/ops/backups/gerar-snapshot
 * 2. POST /api/ops/backups/restaurar-snapshot
 * 3. GET  /api/ops/backups/historico
 * 4. POST /api/ops/auditoria/integridade-cruzada
 *
 * Teto Modular: <= 185 linhas
 */

const express = require('express');
const router = express.Router();
const {
  getOrLoadState,
  mutateTenantState
} = require('../lib/serverContext');

const {
  gerarSnapshotBackupCriptografado,
  validarERestaurarSnapshotBackup,
  executarAuditoriaIntegridadeCruzadaErp,
  listarHistoricoSnapshotsEAuditorias
} = require('../services/ops/productionBackupAuditService');

// 1. Gerar Snapshot de Backup com Checksum SHA-256
router.post('/api/ops/backups/gerar-snapshot', async (req, res) => {
  try {
    let snapshot = null;
    await mutateTenantState(req, draft => {
      const responsavel = req.user?.nome || req.user?.username || req.body.responsavel || 'Admin-Ops';
      snapshot = gerarSnapshotBackupCriptografado(draft, { ...req.body, responsavel });
    });
    res.json({ success: true, snapshot });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'BACKUP_SNAPSHOT_ERROR', error: err.message });
  }
});

// 2. Restaurar Snapshot de Backup após Verificação Anti-Adulteração SHA-256
router.post('/api/ops/backups/restaurar-snapshot', async (req, res) => {
  try {
    let result = null;
    await mutateTenantState(req, draft => {
      const responsavel = req.user?.nome || req.user?.username || req.body.responsavel || 'Admin-Ops';
      const input = req.body.snapshot || req.body.snapshotId || req.body;
      result = validarERestaurarSnapshotBackup(draft, input, {
        confirmarRestauracao: req.body.confirmarRestauracao,
        responsavel
      });
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'RESTORE_BACKUP_ERROR', error: err.message });
  }
});

// 3. Listar Histórico de Snapshots e Laudos de Auditoria
router.get('/api/ops/backups/historico', async (req, res) => {
  try {
    const state = await getOrLoadState(req);
    const dados = listarHistoricoSnapshotsEAuditorias(state);
    res.json({ success: true, ...dados });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, code: 'HISTORICO_OPS_ERROR', error: err.message });
  }
});

// 4. Executar Auditoria de Integridade Cruzada do ERP (com opção de reparo leve)
router.post('/api/ops/auditoria/integridade-cruzada', async (req, res) => {
  try {
    let laudo = null;
    await mutateTenantState(req, draft => {
      const responsavel = req.user?.nome || req.user?.username || req.body.responsavel || 'Auditor-Automatico';
      laudo = executarAuditoriaIntegridadeCruzadaErp(draft, {
        repararInconsistenciasLeves: req.body.repararInconsistenciasLeves,
        responsavel
      });
    });
    res.json({ success: true, laudo });
  } catch (err) {
    res.status(err.status || 400).json({ success: false, code: err.code || 'AUDITORIA_INTEGRIDADE_ERROR', error: err.message });
  }
});

module.exports = router;


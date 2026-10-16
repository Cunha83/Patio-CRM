const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const {
  getOrLoadState,
  salvarEstado,
  extractTenantId,
  requirePermission,
  enqueueWrite,
  gerarId
} = require('../lib/serverContext');
const backupService = require('../services/backupService');
const { migrarSchemaEstado } = require('../lib/repository/migration');
const { validateState } = require('../lib/core');
const { metrics } = require('../lib/metrics');


router.get('/api/backup/download', requirePermission('backup:manage'), async (req, res) => {
  try {
    await enqueueWrite(async () => {});
    const state = await getOrLoadState(req);
    const dHoje = new Date().toISOString().slice(0, 10);
    const nomeArquivo = `backup_patio_crm_${dHoje}_${Date.now()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(state || {}, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Backups físicos contêm TODAS as oficinas e segredos: nunca são operações de administrador de tenant.
router.use(['/api/backup/wal','/api/backup/listar','/api/backup/restaurar'], (req,res,next) => {
  const c=req.securityContext;
  if(c?.actorType!=='user' || c.supportSession || c.tenantId!=='_platform_' || !c.permissions?.includes('backup:global')) return res.status(403).json({error:'Backup físico restrito à operação de infraestrutura.'});
  next();
});
router.post('/api/backup/wal', requirePermission('backup:manage'), async (req, res) => {
  try {
    const tenantId = req.securityContext?.tenantId || 'default';
    const actorId = req.securityContext?.actorId || 'operator';
    const { includeUploads = true } = req.body || {};
    const result = await backupService.executarBackupWal({ tenantId, actorId, includeUploads });
    res.json(result);
  } catch (err) {
    console.error('[API /api/backup/wal POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/backup/listar', requirePermission('backup:manage'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const backups = await backupService.listarBackups(limit);
    res.json({ success: true, backups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/backup/restaurar', requirePermission('backup:manage'), async (req, res) => {
  try {
    const { backupFilepath, verifyOnly = false } = req.body || {};
    if (!backupFilepath) return res.status(400).json({ error: 'backupFilepath é obrigatório.' });
    // P0-3: Validar que backupFilepath resolve para um arquivo real estritamente contido no diretório de backups
    const rawBackupDir = process.env.BACKUP_DIR || path.join(ROOT_DIR, 'backups');
    if (!fs.existsSync(rawBackupDir)) {
      fs.mkdirSync(rawBackupDir, { recursive: true });
    }
    const realBackupDir = fs.realpathSync(path.resolve(rawBackupDir));
    const resolvedPath = path.resolve(realBackupDir, backupFilepath);

    if (!fs.existsSync(resolvedPath)) {
      return res.status(400).json({ error: 'Arquivo de backup não encontrado ou caminho inválido.' });
    }

    const realTargetFile = fs.realpathSync(resolvedPath);
    const relative = path.relative(realBackupDir, realTargetFile);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return res.status(400).json({ error: 'Caminho de backup inválido: fora do diretório permitido.' });
    }

    const result = await backupService.restaurarBackup({ backupFilepath: realTargetFile, verifyOnly });
    res.json(result);
  } catch (err) {
    console.error('[API /api/backup/restaurar POST] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ── Telemetria e Coleta de Métricas ──────────────────────── */
router.get(['/api/metricas', '/api/metrics'], requirePermission('admin:settings'), async (req, res) => {
  try {
    const isGlobalAdmin = req.securityContext?.role === 'admin' && (req.securityContext?.permissions?.includes('*') || false);
    const tenantFilter = req.query.tenantId || (isGlobalAdmin ? null : req.securityContext?.tenantId);
    const detail = req.query.detail === 'true';
    const data = metrics.getMetrics({ tenantId: tenantFilter, detail });
    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    console.error('[API /api/metricas GET] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/backup/importar', requirePermission('backup:manage'), async (req, res) => {
  try {
    const { dados, modo = 'mesclar', versao } = req.body || {};
    if (!['mesclar', 'substituir'].includes(modo)) return res.status(400).json({ error: 'Modo inválido.' });
    const invalid = validateState(dados, modo !== 'substituir');
    if (invalid) return res.status(400).json({ error: invalid });
    if (!dados || typeof dados !== 'object') {
      return res.status(400).json({ success: false, error: 'Objeto de dados inválido para importação.' });
    }

    const stats = {
      clientes: { inseridos: 0, atualizados: 0 },
      veiculos: { inseridos: 0, atualizados: 0 },
      pecas: { inseridos: 0, atualizados: 0 },
      servicos: { inseridos: 0, atualizados: 0 },
      fornecedores: { inseridos: 0, atualizados: 0 },
      os: { inseridos: 0, atualizados: 0 },
      contas: { inseridos: 0, atualizados: 0 }
    };

    let draft = null;

    await enqueueWrite(async () => {
      const currentState = await getOrLoadState(req);
      if (versao !== (currentState?.versao || 0)) {
        const error = new Error('O estado mudou. Atualize os dados antes de importar.');
        error.status = 409;
        throw error;
      }
      draft = JSON.parse(JSON.stringify(currentState || {}));
      if (modo === 'substituir') {
        const cfgAtual = draft.cfg || {};
        const incomingCfg = dados.cfg || {};
        dados.cfg = {
          ...cfgAtual,
          ...incomingCfg,
          grupoAdminId: incomingCfg.grupoAdminId || cfgAtual.grupoAdminId,
          grupoOperacaoId: incomingCfg.grupoOperacaoId || cfgAtual.grupoOperacaoId,
          adminFones: incomingCfg.adminFones || cfgAtual.adminFones
        };
        dados.versao = versao;
        draft = dados;

        stats.clientes.inseridos = (draft.clientes || []).length;
        stats.veiculos.inseridos = (draft.veiculos || []).length;
        stats.pecas.inseridos = (draft.pecas || []).length;
        stats.servicos.inseridos = (draft.servicos || []).length;
        stats.fornecedores.inseridos = (draft.fornecedores || []).length;
        stats.os.inseridos = (draft.os || []).length;
        stats.contas.inseridos = (draft.contas || []).length;
      } else {
        if (!draft.clientes) draft.clientes = [];
        if (!draft.veiculos) draft.veiculos = [];
        if (!draft.pecas) draft.pecas = [];
        if (!draft.servicos) draft.servicos = [];
        if (!draft.fornecedores) draft.fornecedores = [];
        if (!draft.os) draft.os = [];
        if (!draft.contas) draft.contas = [];

        // 1. Clientes
        if (Array.isArray(dados.clientes)) {
          for (const inc of dados.clientes) {
            const docLimpo = (inc.doc || '').replace(/\D/g, '');
            const nomeNorm = (inc.nome || '').trim().toLowerCase();
            const exist = draft.clientes.find(c =>
              (docLimpo && (c.doc || '').replace(/\D/g, '') === docLimpo) ||
              (nomeNorm && (c.nome || '').trim().toLowerCase() === nomeNorm)
            );
            if (exist) {
              Object.assign(exist, inc, { id: exist.id });
              stats.clientes.atualizados++;
            } else {
              inc.id = inc.id || gerarId('c');
              draft.clientes.push(inc);
              stats.clientes.inseridos++;
            }
          }
        }

        // 2. Veículos
        if (Array.isArray(dados.veiculos)) {
          for (const inc of dados.veiculos) {
            const placaNorm = (inc.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
            const exist = draft.veiculos.find(v => (v.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === placaNorm);
            if (exist) {
              Object.assign(exist, inc, { id: exist.id });
              stats.veiculos.atualizados++;
            } else {
              inc.id = inc.id || gerarId('v');
              inc.placa = placaNorm || inc.placa;
              draft.veiculos.push(inc);
              stats.veiculos.inseridos++;
            }
          }
        }

        // 3. Peças / Estoque
        if (Array.isArray(dados.pecas)) {
          for (const inc of dados.pecas) {
            const codNorm = (inc.cod || '').trim().toLowerCase();
            const nomeNorm = (inc.nome || '').trim().toLowerCase();
            const exist = draft.pecas.find(p =>
              (codNorm && (p.cod || '').trim().toLowerCase() === codNorm) ||
              (nomeNorm && (p.nome || '').trim().toLowerCase() === nomeNorm)
            );
            if (exist) {
              exist.qtd = (exist.qtd || 0) + (Number(inc.qtd) || 0);
              if (inc.custo) exist.custo = Number(inc.custo);
              if (inc.venda) exist.venda = Number(inc.venda);
              if (inc.loc && !exist.loc) exist.loc = inc.loc;
              if (inc.forn && !exist.forn) exist.forn = inc.forn;
              stats.pecas.atualizados++;
            } else {
              inc.id = inc.id || gerarId('p');
              draft.pecas.push(inc);
              stats.pecas.inseridos++;
            }
          }
        }

        // 4. Serviços
        if (Array.isArray(dados.servicos)) {
          for (const inc of dados.servicos) {
            const nomeNorm = (inc.nome || '').trim().toLowerCase();
            const exist = draft.servicos.find(s => (s.nome || '').trim().toLowerCase() === nomeNorm);
            if (exist) {
              if (inc.valor) exist.valor = Number(inc.valor);
              if (inc.horas) exist.horas = Number(inc.horas);
              stats.servicos.atualizados++;
            } else {
              inc.id = inc.id || gerarId('s');
              draft.servicos.push(inc);
              stats.servicos.inseridos++;
            }
          }
        }

        // 5. Fornecedores
        if (Array.isArray(dados.fornecedores)) {
          for (const inc of dados.fornecedores) {
            const docLimpo = (inc.doc || '').replace(/\D/g, '');
            const nomeNorm = (inc.nome || '').trim().toLowerCase();
            const exist = draft.fornecedores.find(f =>
              (docLimpo && (f.doc || '').replace(/\D/g, '') === docLimpo) ||
              (nomeNorm && (f.nome || '').trim().toLowerCase() === nomeNorm)
            );
            if (exist) {
              Object.assign(exist, inc, { id: exist.id });
              stats.fornecedores.atualizados++;
            } else {
              inc.id = inc.id || gerarId('f');
              draft.fornecedores.push(inc);
              stats.fornecedores.inseridos++;
            }
          }
        }

        // 6. Ordens de Serviço (OS)
        if (Array.isArray(dados.os)) {
          for (const inc of dados.os) {
            const numStr = String(inc.num || '');
            const exist = draft.os.find(o => String(o.num) === numStr);
            if (exist) {
              stats.os.atualizados++;
            } else {
              inc.id = inc.id || gerarId('os');
              draft.os.push(inc);
              stats.os.inseridos++;
            }
          }
        }

        // 7. Contas
        if (Array.isArray(dados.contas)) {
          for (const inc of dados.contas) {
            inc.id = inc.id || gerarId('ct');
            draft.contas.push(inc);
            stats.contas.inseridos++;
          }
        }

      }

      const saveRes = await salvarEstado(req, draft);
      if (saveRes && !saveRes.ok) {
        const error = new Error(saveRes.error || 'Erro ao persistir importação.');
        error.status = saveRes.status || 500;
        throw error;
      }
      draft.versao = saveRes.versao;
    });

    console.log(`[Backup Import] Concluído com sucesso (Modo: ${modo}). Estatísticas:`, JSON.stringify(stats));
    res.json({ success: true, modo, stats, versao: draft.versao });
  } catch (error) {
    console.error('[API /api/backup/importar] Erro:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});


module.exports = router;
